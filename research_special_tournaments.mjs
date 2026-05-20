// Research script: special tournament formats (ATP Finals, Laver Cup, ATP Cup, United Cup)
// Run from the tennisrepo-web directory:  node research_special_tournaments.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env vars from .env.local
const envContent = readFileSync(join(__dirname, '.env.local'), 'utf8');
const env = Object.fromEntries(
  envContent.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map((p, i) => i === 0 ? p : l.slice(l.indexOf('=') + 1)))
);

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // ── 1. All ATP Finals (level = 'F') ──────────────────────────────────────
  console.log('\n========== 1. ATP Finals (level=F) ==========');
  const { data: atpFinals, error: e1 } = await supabase
    .from('tournaments')
    .select('id, name, year, level, draw_size, surface')
    .eq('level', 'F')
    .order('year', { ascending: false });

  if (e1) { console.error('Error:', e1); return; }
  console.log(`Total rows: ${atpFinals.length}`);
  atpFinals.forEach(t =>
    console.log(`  id=${t.id}  year=${t.year}  name="${t.name}"  draw=${t.draw_size}  surface=${t.surface}`)
  );

  // ── 2. Laver Cup, ATP Cup, United Cup ──────────────────────────────────
  console.log('\n========== 2. Laver Cup / ATP Cup / United Cup ==========');
  const { data: teamEvents, error: e2 } = await supabase
    .from('tournaments')
    .select('id, name, year, level, surface, draw_size')
    .or('name.ilike.%laver%,name.ilike.%atp cup%,name.ilike.%united cup%')
    .order('year', { ascending: false });

  if (e2) { console.error('Error:', e2); return; }
  console.log(`Total rows: ${teamEvents.length}`);
  teamEvents.forEach(t =>
    console.log(`  id=${t.id}  year=${t.year}  level="${t.level}"  name="${t.name}"  draw=${t.draw_size}  surface=${t.surface}`)
  );

  // ── 3. Most recent ATP Finals — all matches grouped by round ────────────
  console.log('\n========== 3. Most recent ATP Finals — all matches ==========');
  const mostRecent = atpFinals?.[0];
  if (!mostRecent) { console.log('No ATP Finals found.'); }
  else {
    console.log(`Using: id=${mostRecent.id}  year=${mostRecent.year}  name="${mostRecent.name}"`);
    const { data: matches, error: e3 } = await supabase
      .from('matches')
      .select('id, round, score, winner_id, loser_id, winner_seed, loser_seed, winner_rank, loser_rank, winner_entry, loser_entry')
      .eq('tournament_id', mostRecent.id);

    if (e3) { console.error('Error:', e3); return; }
    console.log(`Total matches: ${matches.length}`);

    const byRound = {};
    for (const m of matches) {
      if (!byRound[m.round]) byRound[m.round] = [];
      byRound[m.round].push(m);
    }
    for (const [round, ms] of Object.entries(byRound)) {
      console.log(`\n  Round: "${round}" (${ms.length} matches)`);
      ms.forEach(m =>
        console.log(`    winner_id=${m.winner_id} seed=${m.winner_seed} entry=${m.winner_entry} rank=${m.winner_rank} | score="${m.score}" | loser_id=${m.loser_id} seed=${m.loser_seed} entry=${m.loser_entry} rank=${m.loser_rank}`)
      );
    }
  }

  // ── 3b. Distinct rounds across ALL ATP Finals editions ──────────────────
  console.log('\n========== 3b. Distinct rounds across ALL ATP Finals ==========');
  if (atpFinals && atpFinals.length > 0) {
    const allIds = atpFinals.map(t => t.id);
    const { data: allMatches, error: e3b } = await supabase
      .from('matches')
      .select('round, tournament_id')
      .in('tournament_id', allIds)
      .limit(10000);

    if (e3b) { console.error('Error:', e3b); return; }
    const roundSet = new Set(allMatches.map(m => m.round));
    console.log('Distinct rounds:', [...roundSet].sort().join(', '));

    const roundCounts = {};
    for (const m of allMatches) {
      roundCounts[m.round] = (roundCounts[m.round] || 0) + 1;
    }
    console.log('Counts per round:');
    for (const [r, c] of Object.entries(roundCounts).sort((a,b) => b[1]-a[1])) {
      console.log(`  "${r}": ${c}`);
    }
  }

  // ── 4. Team events — fetch all matches ────────────────────────────────
  console.log('\n========== 4. Team event matches (Laver/ATP Cup/United Cup) ==========');
  if (teamEvents && teamEvents.length > 0) {
    const teamIds = teamEvents.map(t => t.id);
    const { data: teamMatches, error: e4 } = await supabase
      .from('matches')
      .select('id, tournament_id, round, score, winner_id, loser_id, winner_seed, loser_seed, winner_rank, loser_rank, winner_entry, loser_entry')
      .in('tournament_id', teamIds)
      .limit(2000);

    if (e4) { console.error('Error:', e4); return; }
    console.log(`Total matches across all team events: ${teamMatches.length}`);

    // Group by tournament, then round
    const byTournament = {};
    for (const m of teamMatches) {
      if (!byTournament[m.tournament_id]) byTournament[m.tournament_id] = {};
      if (!byTournament[m.tournament_id][m.round]) byTournament[m.tournament_id][m.round] = [];
      byTournament[m.tournament_id][m.round].push(m);
    }

    for (const [tid, rounds] of Object.entries(byTournament).sort((a,b) => {
      const ta = teamEvents.find(x => x.id == a[0]);
      const tb = teamEvents.find(x => x.id == b[0]);
      return (tb?.year ?? 0) - (ta?.year ?? 0);
    })) {
      const t = teamEvents.find(x => x.id == tid);
      console.log(`\n  Tournament id=${tid}  name="${t?.name}"  year=${t?.year}  level=${t?.level}`);
      for (const [round, ms] of Object.entries(rounds)) {
        console.log(`    Round: "${round}" (${ms.length} matches)`);
        // Print first 5 sample matches
        ms.slice(0, 5).forEach(m =>
          console.log(`      winner_id=${m.winner_id} entry=${m.winner_entry} seed=${m.winner_seed} rank=${m.winner_rank} | score="${m.score}" | loser_id=${m.loser_id} entry=${m.loser_entry} seed=${m.loser_seed}`)
        );
        if (ms.length > 5) console.log(`      ... and ${ms.length - 5} more`);
      }
    }

    const teamRoundSet = new Set(teamMatches.map(m => m.round));
    console.log(`\nDistinct rounds across all team events: ${[...teamRoundSet].sort().join(', ')}`);
  }

  // ── 5. Cross-reference: winner_id/loser_id → player names for team events ──
  console.log('\n========== 5. Sample player lookups for team events ==========');
  if (teamEvents && teamEvents.length > 0) {
    // Get matches from the most recent team event with matches
    const teamIds = teamEvents.map(t => t.id);
    const { data: sampleMatches } = await supabase
      .from('matches')
      .select('tournament_id, round, winner_id, loser_id, score')
      .in('tournament_id', teamIds)
      .limit(20);

    if (sampleMatches && sampleMatches.length > 0) {
      const playerIds = [...new Set([
        ...sampleMatches.map(m => m.winner_id),
        ...sampleMatches.map(m => m.loser_id),
      ])];
      const { data: players } = await supabase
        .from('players')
        .select('id, full_name, country_code')
        .in('id', playerIds);

      const playerMap = Object.fromEntries((players || []).map(p => [p.id, p]));
      const tName = (tid) => teamEvents.find(t => t.id == tid)?.name ?? tid;

      console.log('\nSample matches with player names:');
      sampleMatches.forEach(m => {
        const w = playerMap[m.winner_id];
        const l = playerMap[m.loser_id];
        console.log(
          `  [${tName(m.tournament_id)}] round=${m.round}  ` +
          `${w?.full_name ?? m.winner_id} (${w?.country_code}) def. ${l?.full_name ?? m.loser_id} (${l?.country_code})  score="${m.score}"`
        );
      });
    }
  }
}

main().catch(console.error);
