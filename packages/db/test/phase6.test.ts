import { describe, expect, it } from 'vitest';
import { MemoryRealtimeBus, MemoryWearStore, WearStoreError } from '../src/index';
import type { RealtimeEvent, WearStore } from '../src/index';

function makeStore(start: string = '2026-04-18T00:00:00.000Z'): WearStore {
  let t = new Date(start).getTime();
  return new MemoryWearStore({
    now: () => {
      t += 1000;
      return new Date(t);
    },
  });
}

describe('StoryRepo', () => {
  it('creates a story with a 24h expiry by default', async () => {
    const store = makeStore('2026-04-18T00:00:00.000Z');
    const story = await store.stories.create({
      authorId: 'usr_001',
      mediaUrl: 'https://example.test/a.jpg',
    });
    expect(story.authorId).toBe('usr_001');
    const ageHours = (Date.parse(story.expiresAt) - Date.parse(story.createdAt)) / (1000 * 60 * 60);
    expect(ageHours).toBeCloseTo(24, 5);
  });

  it('rejects empty media for non-text stories and empty captions for text stories', async () => {
    const store = makeStore();
    await expect(
      store.stories.create({ authorId: 'usr_001', mediaKind: 'image' }),
    ).rejects.toBeInstanceOf(WearStoreError);
    await expect(
      store.stories.create({ authorId: 'usr_001', mediaKind: 'text', caption: '   ' }),
    ).rejects.toBeInstanceOf(WearStoreError);
  });

  it('hides expired stories from the active list but keeps them for the author', async () => {
    const store = makeStore('2026-04-18T00:00:00.000Z');
    const story = await store.stories.create({
      authorId: 'usr_001',
      mediaUrl: 'https://x',
      ttlMs: 2000,
    });
    expect((await store.stories.listActiveForViewer('usr_001')).length).toBe(1);
    // Burn 5 simulated seconds.
    for (let i = 0; i < 5; i++) await store.stories.getById(story.id);
    expect((await store.stories.listActiveForViewer('usr_001')).length).toBe(0);
    expect((await store.stories.listByAuthor('usr_001')).length).toBe(1);
  });

  it('respects followers-only audience', async () => {
    const store = makeStore();
    await store.stories.create({
      authorId: 'usr_001',
      mediaUrl: 'https://x',
      audience: 'followers',
    });
    expect((await store.stories.listActiveForViewer('usr_002')).length).toBe(0);
    await store.follows.follow('usr_002', 'usr_001');
    expect((await store.stories.listActiveForViewer('usr_002')).length).toBe(1);
  });

  it('records views and exposes them only to the author', async () => {
    const store = makeStore();
    const story = await store.stories.create({ authorId: 'usr_001', mediaUrl: 'https://x' });
    await store.stories.recordView(story.id, 'usr_002');
    await store.stories.recordView(story.id, 'usr_002'); // idempotent
    const viewers = await store.stories.listViewers(story.id, 'usr_001');
    expect(viewers.map((v) => v.viewerId)).toEqual(['usr_002']);
    await expect(store.stories.listViewers(story.id, 'usr_999')).rejects.toBeInstanceOf(
      WearStoreError,
    );
  });

  it('builds a tray sorted self → unseen → seen', async () => {
    const store = makeStore();
    const own = await store.stories.create({ authorId: 'usr_001', mediaUrl: 'https://x' });
    const followed = await store.stories.create({
      authorId: 'usr_002',
      mediaUrl: 'https://x',
    });
    await store.follows.follow('usr_001', 'usr_002');
    const tray = await store.stories.trayForViewer('usr_001');
    expect(tray.map((t) => t.authorId)).toEqual(['usr_001', 'usr_002']);
    expect(tray[1]?.hasUnseen).toBe(true);
    await store.stories.recordView(followed.id, 'usr_001');
    const tray2 = await store.stories.trayForViewer('usr_001');
    expect(tray2.find((t) => t.authorId === 'usr_002')?.hasUnseen).toBe(false);
    expect(own.id).toMatch(/^sty_/);
  });

  it('blocks story visibility and reactions across blocked pairs', async () => {
    const store = makeStore();
    const story = await store.stories.create({ authorId: 'usr_001', mediaUrl: 'https://x' });
    await store.blocks.block('usr_002', 'usr_001');
    expect((await store.stories.listActiveForViewer('usr_002')).length).toBe(0);
    await expect(
      store.stories.addReaction({ storyId: story.id, userId: 'usr_002', kind: 'amen' }),
    ).rejects.toBeInstanceOf(WearStoreError);
  });

  it('allows the author to delete their own story and cleans up references', async () => {
    const store = makeStore();
    const story = await store.stories.create({ authorId: 'usr_001', mediaUrl: 'https://x' });
    await store.stories.recordView(story.id, 'usr_002');
    await store.stories.delete(story.id, 'usr_001');
    expect(await store.stories.getById(story.id)).toBeNull();
  });
});

describe('HighlightRepo', () => {
  it('creates highlights and rejects foreign stories', async () => {
    const store = makeStore();
    const ownStory = await store.stories.create({ authorId: 'usr_001', mediaUrl: 'https://x' });
    const otherStory = await store.stories.create({ authorId: 'usr_002', mediaUrl: 'https://x' });
    const highlight = await store.highlights.create({
      ownerId: 'usr_001',
      name: 'Salt drops',
    });
    const updated = await store.highlights.addStory(highlight.id, ownStory.id, 'usr_001');
    expect(updated.storyIds).toEqual([ownStory.id]);
    await expect(
      store.highlights.addStory(highlight.id, otherStory.id, 'usr_001'),
    ).rejects.toBeInstanceOf(WearStoreError);
  });

  it('refuses modifications by non-owners', async () => {
    const store = makeStore();
    const highlight = await store.highlights.create({ ownerId: 'usr_001', name: 'h' });
    await expect(
      store.highlights.addStory(highlight.id, 'sty_x', 'usr_002'),
    ).rejects.toBeInstanceOf(WearStoreError);
    await expect(store.highlights.delete(highlight.id, 'usr_002')).rejects.toBeInstanceOf(
      WearStoreError,
    );
  });
});

describe('ConversationRepo + MessageRepo', () => {
  it('creates a 1:1 conversation idempotently', async () => {
    const store = makeStore();
    const a = await store.conversations.getOrCreateDirect('usr_001', 'usr_002');
    const b = await store.conversations.getOrCreateDirect('usr_002', 'usr_001');
    expect(a.id).toBe(b.id);
    expect(a.kind).toBe('direct');
  });

  it('rejects self-DM and DM with a blocked user', async () => {
    const store = makeStore();
    await expect(
      store.conversations.getOrCreateDirect('usr_001', 'usr_001'),
    ).rejects.toBeInstanceOf(WearStoreError);
    await store.blocks.block('usr_002', 'usr_001');
    await expect(
      store.conversations.getOrCreateDirect('usr_001', 'usr_002'),
    ).rejects.toBeInstanceOf(WearStoreError);
  });

  it('lands new DMs as a request when the recipient does not follow back', async () => {
    const store = makeStore();
    const conv = await store.conversations.getOrCreateDirect('usr_001', 'usr_002');
    const recipient = await store.conversations.membership(conv.id, 'usr_002');
    expect(recipient?.requestState).toBe('requested');

    // Recipient cannot reply until they accept.
    await expect(
      store.messages.send({
        conversationId: conv.id,
        authorId: 'usr_002',
        body: 'hey',
      }),
    ).rejects.toBeInstanceOf(WearStoreError);

    await store.conversations.acceptRequest(conv.id, 'usr_002');
    const msg = await store.messages.send({
      conversationId: conv.id,
      authorId: 'usr_002',
      body: 'hey',
    });
    expect(msg.body).toBe('hey');
  });

  it('auto-accepts when the recipient already follows the sender', async () => {
    const store = makeStore();
    await store.follows.follow('usr_002', 'usr_001');
    const conv = await store.conversations.getOrCreateDirect('usr_001', 'usr_002');
    const recipient = await store.conversations.membership(conv.id, 'usr_002');
    expect(recipient?.requestState).toBe('accepted');
  });

  it('creates groups and refuses tiny groups', async () => {
    const store = makeStore();
    await expect(
      store.conversations.createGroup({
        createdById: 'usr_001',
        name: 'just me',
        memberIds: [],
      }),
    ).rejects.toBeInstanceOf(WearStoreError);
    const group = await store.conversations.createGroup({
      createdById: 'usr_001',
      name: 'Salt circle',
      memberIds: ['usr_002', 'usr_003'],
    });
    expect((await store.conversations.listMembers(group.id)).length).toBe(3);
  });

  it('counts unread messages and clears them on markRead', async () => {
    const store = makeStore();
    await store.follows.follow('usr_002', 'usr_001');
    const conv = await store.conversations.getOrCreateDirect('usr_001', 'usr_002');
    await store.messages.send({ conversationId: conv.id, authorId: 'usr_001', body: 'hi' });
    await store.messages.send({ conversationId: conv.id, authorId: 'usr_001', body: 'two' });
    const inbox = await store.conversations.listForUser('usr_002');
    expect(inbox[0]?.unreadCount).toBe(2);
    await store.conversations.markRead(conv.id, 'usr_002');
    const inbox2 = await store.conversations.listForUser('usr_002');
    expect(inbox2[0]?.unreadCount).toBe(0);
  });

  it('soft-deletes own messages', async () => {
    const store = makeStore();
    const conv = await store.conversations.getOrCreateDirect('usr_001', 'usr_002');
    const msg = await store.messages.send({
      conversationId: conv.id,
      authorId: 'usr_001',
      body: 'oops',
    });
    await store.messages.deleteOwn(msg.id, 'usr_001');
    const list = await store.messages.list(conv.id, 'usr_001');
    expect(list.items[0]?.deletedAt).not.toBeNull();
    expect(list.items[0]?.body).toBe('');
    await expect(store.messages.deleteOwn(msg.id, 'usr_002')).rejects.toBeInstanceOf(
      WearStoreError,
    );
  });

  it('refuses listing/sending for non-members', async () => {
    const store = makeStore();
    const conv = await store.conversations.getOrCreateDirect('usr_001', 'usr_002');
    await expect(store.messages.list(conv.id, 'usr_999')).rejects.toBeInstanceOf(WearStoreError);
    await expect(
      store.messages.send({ conversationId: conv.id, authorId: 'usr_999', body: 'spy' }),
    ).rejects.toBeInstanceOf(WearStoreError);
  });
});

describe('BlockRepo', () => {
  it('block is symmetric for visibility checks and unfollows both edges', async () => {
    const store = makeStore();
    await store.follows.follow('usr_001', 'usr_002');
    await store.follows.follow('usr_002', 'usr_001');
    await store.blocks.block('usr_001', 'usr_002');
    expect(await store.blocks.isBlockedEither('usr_002', 'usr_001')).toBe(true);
    expect(await store.follows.isFollowing('usr_001', 'usr_002')).toBe(false);
    expect(await store.follows.isFollowing('usr_002', 'usr_001')).toBe(false);
  });

  it('rejects self-block and is idempotent', async () => {
    const store = makeStore();
    await expect(store.blocks.block('usr_001', 'usr_001')).rejects.toBeInstanceOf(WearStoreError);
    const a = await store.blocks.block('usr_001', 'usr_002');
    const b = await store.blocks.block('usr_001', 'usr_002');
    expect(a.createdAt).toBe(b.createdAt);
  });
});

describe('ReportRepo', () => {
  it('records reports for any subject kind', async () => {
    const store = makeStore();
    await store.reports.create({
      reporterId: 'usr_001',
      subjectKind: 'post',
      subjectId: 'pst_x',
      reason: 'abuse',
      note: 'bad',
    });
    const list = await store.reports.listForSubject('post', 'pst_x');
    expect(list.length).toBe(1);
    expect(list[0]?.reason).toBe('abuse');
  });
});

describe('MemoryRealtimeBus', () => {
  it('fans out events to subscribers and unsubscribes cleanly', () => {
    const bus = new MemoryRealtimeBus();
    const seen: RealtimeEvent[] = [];
    const unsub = bus.subscribe('conv:cnv_x', (e) => seen.push(e));
    bus.publish('conv:cnv_x', {
      kind: 'message.created',
      conversationId: 'cnv_x',
      messageId: 'msg_1',
      authorId: 'usr_001',
      at: '2026-04-18T00:00:00.000Z',
    });
    bus.publish('conv:other', {
      kind: 'message.created',
      conversationId: 'other',
      messageId: 'msg_2',
      authorId: 'usr_001',
      at: '2026-04-18T00:00:00.000Z',
    });
    expect(seen.length).toBe(1);
    unsub();
    bus.publish('conv:cnv_x', {
      kind: 'message.created',
      conversationId: 'cnv_x',
      messageId: 'msg_3',
      authorId: 'usr_001',
      at: '2026-04-18T00:00:00.000Z',
    });
    expect(seen.length).toBe(1);
  });

  it('isolates listener errors', () => {
    const bus = new MemoryRealtimeBus();
    const seen: RealtimeEvent[] = [];
    bus.subscribe('user:usr_001', () => {
      throw new Error('boom');
    });
    bus.subscribe('user:usr_001', (e) => seen.push(e));
    bus.publish('user:usr_001', {
      kind: 'story.posted',
      storyId: 'sty_1',
      authorId: 'usr_001',
      at: '2026-04-18T00:00:00.000Z',
    });
    expect(seen.length).toBe(1);
  });
});
