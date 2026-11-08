import type { Server as IOServer, Socket } from "socket.io";
import type * as mediasoup from "mediasoup";
import { getOrCreateRoom, getRoom, removeRoomIfEmpty } from "./room.js";

function roomName(roomId: string) {
  return `sfu:${roomId}`;
}

interface SocketRoomState {
  roomId: string;
  userId: string;
}

// Socket.IO instance id -> which SFU room it's in, so disconnect cleanup doesn't need the
// client to tell us (it may not get the chance on a dropped connection).
const socketRooms = new Map<string, SocketRoomState>();

export function registerMediaSocket(io: IOServer, socket: Socket) {
  const userId: string = socket.data.userId;

  socket.on("sfu:join", async ({ roomId }: { roomId: string }, ack: (res: unknown) => void) => {
    try {
      const room = await getOrCreateRoom(roomId);
      room.getOrCreatePeer(userId, socket.id);
      socketRooms.set(socket.id, { roomId, userId });
      await socket.join(roomName(roomId));

      ack({
        rtpCapabilities: room.router.rtpCapabilities,
        producers: room.listProducers(userId),
      });
    } catch (err) {
      console.error("sfu:join failed", err);
      ack({ error: "join-failed" });
    }
  });

  socket.on(
    "sfu:create-transport",
    async ({ roomId }: { roomId: string }, ack: (res: unknown) => void) => {
      try {
        const room = getRoom(roomId);
        const peer = room?.peers.get(userId);
        if (!room || !peer) return ack({ error: "no-room" });

        const transport = await room.createWebRtcTransport(peer);
        ack({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      } catch (err) {
        console.error("sfu:create-transport failed", err);
        ack({ error: "create-transport-failed" });
      }
    },
  );

  socket.on(
    "sfu:connect-transport",
    async (
      { roomId, transportId, dtlsParameters }: { roomId: string; transportId: string; dtlsParameters: mediasoup.types.DtlsParameters },
      ack: (res: unknown) => void,
    ) => {
      try {
        const peer = getRoom(roomId)?.peers.get(userId);
        const transport = peer?.transports.get(transportId);
        if (!transport) return ack({ error: "no-transport" });
        await transport.connect({ dtlsParameters });
        ack({ ok: true });
      } catch (err) {
        console.error("sfu:connect-transport failed", err);
        ack({ error: "connect-transport-failed" });
      }
    },
  );

  socket.on(
    "sfu:produce",
    async (
      {
        roomId,
        transportId,
        kind,
        rtpParameters,
        appData,
      }: {
        roomId: string;
        transportId: string;
        kind: mediasoup.types.MediaKind;
        rtpParameters: mediasoup.types.RtpParameters;
        appData: Record<string, unknown>;
      },
      ack: (res: unknown) => void,
    ) => {
      try {
        const room = getRoom(roomId);
        const peer = room?.peers.get(userId);
        const transport = peer?.transports.get(transportId);
        if (!room || !peer || !transport) return ack({ error: "no-transport" });

        const producer = await transport.produce({ kind, rtpParameters, appData: { ...appData, userId } });
        peer.producers.set(producer.id, producer);

        producer.on("transportclose", () => {
          peer.producers.delete(producer.id);
        });

        socket.to(roomName(roomId)).emit("sfu:new-producer", {
          producerId: producer.id,
          userId,
          kind: producer.kind,
          appData: producer.appData,
        });

        ack({ id: producer.id });
      } catch (err) {
        console.error("sfu:produce failed", err);
        ack({ error: "produce-failed" });
      }
    },
  );

  socket.on(
    "sfu:consume",
    async (
      {
        roomId,
        transportId,
        producerId,
        rtpCapabilities,
      }: {
        roomId: string;
        transportId: string;
        producerId: string;
        rtpCapabilities: mediasoup.types.RtpCapabilities;
      },
      ack: (res: unknown) => void,
    ) => {
      try {
        const room = getRoom(roomId);
        const peer = room?.peers.get(userId);
        const transport = peer?.transports.get(transportId);
        if (!room || !peer || !transport) return ack({ error: "no-transport" });

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
          return ack({ error: "cannot-consume" });
        }

        // Starts paused: the client needs the consumer's track wired up to a <video>/<audio>
        // element before resuming, or the first frames/packets arrive into nothing.
        const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
        peer.consumers.set(consumer.id, consumer);

        consumer.on("transportclose", () => peer.consumers.delete(consumer.id));
        consumer.on("producerclose", () => {
          peer.consumers.delete(consumer.id);
          socket.emit("sfu:producer-closed", { producerId });
        });

        ack({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (err) {
        console.error("sfu:consume failed", err);
        ack({ error: "consume-failed" });
      }
    },
  );

  socket.on(
    "sfu:resume-consumer",
    async ({ roomId, consumerId }: { roomId: string; consumerId: string }, ack: (res: unknown) => void) => {
      try {
        const peer = getRoom(roomId)?.peers.get(userId);
        const consumer = peer?.consumers.get(consumerId);
        if (!consumer) return ack({ error: "no-consumer" });
        await consumer.resume();
        ack({ ok: true });
      } catch (err) {
        console.error("sfu:resume-consumer failed", err);
        ack({ error: "resume-failed" });
      }
    },
  );

  socket.on(
    "sfu:close-producer",
    ({ roomId, producerId }: { roomId: string; producerId: string }) => {
      const peer = getRoom(roomId)?.peers.get(userId);
      const producer = peer?.producers.get(producerId);
      if (!producer) return;
      producer.close();
      peer?.producers.delete(producerId);
      socket.to(roomName(roomId)).emit("sfu:producer-closed", { producerId });
    },
  );

  socket.on("sfu:leave", async () => {
    await leaveCurrentRoom(io, socket);
  });

  socket.on("disconnect", async () => {
    await leaveCurrentRoom(io, socket);
  });
}

async function leaveCurrentRoom(io: IOServer, socket: Socket) {
  const state = socketRooms.get(socket.id);
  if (!state) return;
  socketRooms.delete(socket.id);

  const room = getRoom(state.roomId);
  if (!room) return;

  const closedProducerIds = room.closePeer(state.userId, socket.id);
  if (closedProducerIds) {
    for (const producerId of closedProducerIds) {
      io.to(roomName(state.roomId)).emit("sfu:producer-closed", { producerId });
    }
  }
  io.to(roomName(state.roomId)).emit("sfu:peer-left", { userId: state.userId });
  removeRoomIfEmpty(state.roomId);
}
