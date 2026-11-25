import AvatarStore, { avatarForMessage } from './AvatarStore.js';
import { normalizeHistoryMessage } from '../history/normalizeHistoryMessage.js';

import { TRACK } from '../../client/game/marbleTrack.js';

const DEVELOPER_CHZZK_ID = '50829cb1f5ec5f3a202481fca210717b';
const DEVELOPER_CHZZK_JOIN_EMOTE = 'https://ssl.pstatic.net/static/nng/glive/icon/b_05.gif';
const DEVELOPER_SOOP_ID = 'lmhkiu';
const DEVELOPER_SOOP_JOIN_EMOTE = '/하하/';

export default class MarbleGame {
    constructor({ onChange = () => {}, excludedNicknames = [] } = {}) {
        this.onChange = onChange;
        this.excluded = new Set(excludedNicknames.filter(name => name.trim().normalize() !== '지니주디'));
        this.entrants = new Map();
        this.avatars = new AvatarStore();
        this.maxPlayers = 10;
        this.reset();
    }

    reset() {
        this.entrants.clear();
        this.state = { phase: 'idle', paused: false };
        this.emit();
    }

    snapshot() {
        return { ...this.state, entrants: this.entrants.size, roster: [...this.entrants.values()], maxPlayers: this.maxPlayers };
    }

    emit() { this.onChange(this.snapshot()); }

    start(maxPlayers = this.maxPlayers) {
        if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > TRACK.maxPlayers) return;
        if (!['idle', 'finished'].includes(this.state.phase)) return;
        this.maxPlayers = maxPlayers;
        this.entrants.clear();
        this.state = { phase: 'recruiting', paused: false };
        this.emit();
    }

    acceptChat(message) {
        if (this.state.phase !== 'recruiting' || this.state.paused) return;
        const person = normalizeHistoryMessage(message);
        if (!person || this.excluded.has(person.nickname.trim())) return;
        const content = person.content.trim();
        const chzzkDeveloperJoin = person.platform === 'chzzk' && person.userId === DEVELOPER_CHZZK_ID &&
            Array.from(content.matchAll(/\{:([^:]+):\}/g)).some(([, name]) => person.metadata.emojis?.[name] === DEVELOPER_CHZZK_JOIN_EMOTE);
        const soopDeveloperJoin = person.platform === 'soop' && person.userId === DEVELOPER_SOOP_ID &&
            person.kind === 'text' && (content.match(/\/[^/\r\n]+\//g)?.includes(DEVELOPER_SOOP_JOIN_EMOTE) ?? false);
        if (!chzzkDeveloperJoin && !soopDeveloperJoin && !['!참여', '!참가'].includes(content)) return;
        const key = person.platform + ':' + person.userId;
        if (!this.entrants.has(key) && this.entrants.size >= this.maxPlayers) return;
        const existing = this.entrants.get(key);
        const avatarUrl = avatarForMessage(message, person) || existing?.avatarUrl || '';
        if (existing?.nickname === person.nickname && existing.avatarUrl === avatarUrl) return;
        const avatarLookup = person.platform === 'chzzk' && /^[a-f0-9]{32}$/i.test(person.userId);
        this.entrants.set(key, { key, platform: person.platform, userId: person.userId, nickname: person.nickname, avatarUrl, avatarLookup });
        this.emit();
    }

    launch() {
        if (this.state.phase !== 'recruiting' || this.state.paused || !this.entrants.size) return;
        this.state.phase = 'racing';
        this.emit();
    }

    abortRace() {
        if (this.state.phase !== 'racing') return;
        this.state = { phase: 'recruiting', paused: false };
        this.emit();
    }

    pause() {
        if (this.state.paused || !['recruiting', 'racing'].includes(this.state.phase)) return;
        this.state.paused = true;
        this.emit();
    }

    resume() {
        if (!this.state.paused) return;
        this.state.paused = false;
        this.emit();
    }

    action(action, maxPlayers) {
        if (action === 'start') this.start(maxPlayers);
        else if (action === 'launch') this.launch();
        else if (action === 'pause') this.pause();
        else if (action === 'resume') this.resume();
        else if (action === 'reset') this.reset();
        else if (action === 'finish' && this.state.phase === 'racing') {
            this.state = { phase: 'finished', paused: false };
            this.emit();
        }
    }

    destroy() {
        this.avatars.destroy();
        this.entrants.clear();
    }
}
