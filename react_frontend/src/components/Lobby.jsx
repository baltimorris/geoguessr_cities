import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../supabase';

// Random waypoints for a bubble to drift between
const drift = (range, n = 6) =>
  [0, ...Array.from({ length: n }, () => Math.round((Math.random() * 2 - 1) * range))];

function Bubble({ role, label }) {
  const xPath = useMemo(() => drift(120), []);
  const yPath = useMemo(() => drift(140), []);
  const roleEmoji = role === 'mappr' ? '\u{1F5FA}️' : '\u{1F4F7}';
  return (
    <motion.div
      className="bubble"
      animate={{ x: xPath, y: yPath }}
      transition={{ duration: 30, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
    >
      <span className="bubble-role">{roleEmoji}</span>
      <span className="bubble-tag">{label}</span>
    </motion.div>
  );
}

export default function Lobby({ role, team, player, setPlayer, game }) {
  const [members, setMembers] = useState([]);
  const channelRef = useRef(null);
  const myKey = useMemo(() => Math.random().toString(36).slice(2), []);

  // Everyone in the lobby announces themselves, everyone renders their teammates
  useEffect(() => {
    if (!supabase || !game?.id || !team?.name) return;
    const channel = supabase.channel(`lobby-${game.id}`, {
      config: { presence: { key: myKey } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const everyone = Object.entries(state).map(([key, metas]) => ({ key, ...metas[0] }));
        setMembers(everyone.filter(m => m.team === team.name));
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          channel.track({ team: team.name, role, tag: player.tag });
        }
      });
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [game?.id, team?.name, role, myKey]);

  // tag edits update your presence without resubscribing
  useEffect(() => {
    channelRef.current?.track({ team: team?.name, role, tag: player.tag });
  }, [player.tag]);

  // no backend? it's just you in here
  const bubbles = supabase && members.length
    ? members
    : [{ key: 'me', role, tag: player.tag }];

  return (
    <div className="lobby">
      <h2>You're in!</h2>
      <p className="team-hint">Hang tight until the game runner starts things off</p>
      <input
        className="player-tag-input"
        maxLength={12}
        placeholder="emoji or name"
        value={player.tag}
        onChange={e => setPlayer({ ...player, tag: e.target.value })}
      />
      <div className="lobby-area">
        {bubbles.map(m => (
          <Bubble key={m.key} role={m.role} label={m.tag || team.name} />
        ))}
      </div>
    </div>
  );
}
