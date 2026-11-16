// state.js — the one place the whole match lives. Every other module reads
// or mutates this object through the helpers here; nothing keeps a private
// copy of match state. Rendering never writes to it.

export function createState() {
  return {
    time: 0,               // simulated seconds since boot
    phase: 'buy',          // buy | live | end | over
    phaseT: 0,             // seconds left in the current phase
    round: 1,
    half: 1,
    score: { atk: 0, def: 0 },
    winner: null,          // match winner team id, once phase is 'over'
    endReason: '',         // why the last round ended
    actors: [],            // every combatant, player first
    player: null,          // the actor the human drives
    bomb: {
      state: 'carried',    // carried | dropped | planting | planted | defusing | done
      carrier: null,       // actor id while carried
      x: 0, z: 0,          // ground position while dropped or planted
      site: null,          // 'A' | 'B' once planted
      channel: 0,          // seconds of plant/defuse progress
      channelBy: null,     // actor doing the channel
      fuse: 0,             // seconds to detonation once planted
    },
    projectiles: [],       // thrown grenades in flight
    smokes: [],            // active smoke clouds {x,z,r,until}
    flashes: [],           // recent flash bursts {x,y,z,at}
    feed: [],              // kill feed entries {text, at}
    shots: [],             // gunfire events for hearing {x,z,team,at}
    roundStats: { shots: 0, hits: 0 },
    message: '',           // centre-screen banner text
    messageUntil: 0,
    buyOpen: false,        // the buy menu is on screen
    started: false,        // the player has clicked into the match
  };
}

// Append a line to the kill feed; the HUD trims it by age.
export function pushFeed(state, text) {
  state.feed.push({ text, at: state.time });
  if (state.feed.length > 6) state.feed.shift();
}

// A short centre banner ("ROUND 3 — VANGUARD TO PLANT") for a few seconds.
export function banner(state, text, seconds = 2.6) {
  state.message = text;
  state.messageUntil = state.time + seconds;
}

// Living actors of one team, or of both when team is null.
export function aliveActors(state, team = null) {
  return state.actors.filter((a) => a.alive && (team === null || a.team === team));
}

export function actorById(state, id) {
  return state.actors.find((a) => a.id === id) || null;
}
