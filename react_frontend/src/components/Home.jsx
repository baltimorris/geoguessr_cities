import React, { useState, useEffect } from 'react';
import Btn from './Btn';
import { supabase } from '../supabase';

// localguessr.com's actual homepage now - replaces the old static
// website/index.html (which pointed at the long-retired shinyapps.io DC/NYC
// apps). Play Now only lights up when there's a real game to join, checked
// once against the games table - no point sending someone to an empty code
// entry screen outside of an actual event.
export default function Home({ onPlay }) {
  const [liveGame, setLiveGame] = useState(null); // null = checking, true/false once known

  useEffect(() => {
    if (!supabase) { setLiveGame(false); return; }
    let cancelled = false;
    supabase.from('games').select('id', { count: 'exact', head: true }).in('status', ['lobby', 'active'])
      .then(({ count }) => { if (!cancelled) setLiveGame((count || 0) > 0); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="home">
      <div className="home-hero">
        <h1 className="home-title">LocalGuessr</h1>
        <p className="home-tagline">GeoGuessr, but it's your own backyard</p>
      </div>

      <div className="home-section">
        <p>
          If you've ever played <a href="https://www.geoguessr.com" target="_blank" rel="noopener noreferrer">GeoGuessr</a>,
          you've probably gotten frustrated by how hard it is to memorize every telephone pole and street
          sign style in the world just to play well.
        </p>
        <p>
          Enter <strong>LocalGuessr</strong> - a spin on the game that keeps things close to home. Just
          like GeoGuessr, your team gets dropped into a random spot via Street View, but every location is
          in <em>your</em> city. It's just your own urban jungle now, and the knowledge you already have is
          all you need.
        </p>
      </div>

      <div className="home-section">
        <h2>How it works</h2>
        <p>
          Plays like bar trivia - teams compete to guess where each location actually is, in person,
          together. Grab a team, pick a name, and one of you is the <strong>Guessr</strong> (drops the
          pins on the map) while everyone else can be a <strong>Viewr</strong> and explore the live
          street view together on their own phones.
        </p>
        <p>
          A typical game is 3 rounds of 5 locations, 15 minutes a round. After each round the room sees
          exactly where everyone landed and how the scores shook out, before the next round kicks off.
        </p>
      </div>

      <div className="home-play">
        <h2>Ready to play?</h2>
        {liveGame === null && <p className="team-hint">Checking for a live game…</p>}
        {liveGame === false && (
          <p className="team-hint">No game running right now - check Instagram or the newsletter for the next one.</p>
        )}
        {liveGame === true && (
          <Btn className="btn-lg" onClick={onPlay}>Play now!</Btn>
        )}
      </div>

      <div className="home-section home-contact">
        <h2>Contact</h2>
        <p>
          <strong>Instagram</strong>: <a href="https://www.instagram.com/localguessr/" target="_blank" rel="noopener noreferrer">@localguessr</a> - best place to see upcoming and recent events.
        </p>
        <p>
          <strong>Newsletter</strong>: <a href="https://forms.gle/MkEZgMrmh6Dkrinr9" target="_blank" rel="noopener noreferrer">Sign up</a> - best way to get a direct email about upcoming events.
        </p>
        <p>
          <strong>Email</strong>: <a href="mailto:localguessr@gmail.com">localguessr@gmail.com</a> - for anything else, including scheduling an event.
        </p>
      </div>

      <div className="home-section home-support">
        <h2>Support</h2>
        <p>
          LocalGuessr is a small operation - we made a game and host events to play it. Playing is always
          free. If you'd like to chip in to help keep it running (never required), you can do that{' '}
          <a href="https://buymeacoffee.com/localguessr" target="_blank" rel="noopener noreferrer">here</a>.
        </p>
      </div>
    </div>
  );
}
