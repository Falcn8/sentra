import test from 'node:test';
import assert from 'node:assert/strict';
import { nextCollection, RSS_REFRESH_MINUTES, DEFAULT_WEB_REFRESH_MINUTES } from '../server/collection-schedule.ts';

test('live collection checks feeds each minute and websites every five minutes',()=>{
  assert.equal(RSS_REFRESH_MINUTES,1);assert.equal(DEFAULT_WEB_REFRESH_MINUTES,5);
  const state={lastWeb:0,lastRss:0,webMinutes:5,kinds:['HTML archive','RSS feed']};
  assert.equal(nextCollection({...state,now:59_999}),null);
  assert.equal(nextCollection({...state,now:60_000}),'rss');
  assert.equal(nextCollection({...state,now:299_999,lastRss:299_000}),null);
  assert.equal(nextCollection({...state,now:300_000}),'all');
});

test('paused feed sources are not checked and explicit slower website intervals are respected',()=>{
  const state={lastWeb:0,lastRss:0,webMinutes:15,kinds:['HTML archive']};
  assert.equal(nextCollection({...state,now:60_000}),null);
  assert.equal(nextCollection({...state,now:300_000}),null);
  assert.equal(nextCollection({...state,now:900_000}),'all');
  assert.equal(nextCollection({...state,now:900_000,kinds:[]}),null);
});
