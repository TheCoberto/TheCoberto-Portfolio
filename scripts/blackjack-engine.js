/*
 * Blackjack engine: shoe, hand math, odds/EV analysis, basic strategy and plain-English explanations.
 * No DOM access, so it can be tested in Node:  node -e "const BJ = require('./scripts/blackjack-engine.js')"
 *
 * Card values: 1 = Ace, 2..9, 10 = any ten-value card (10, J, Q, K).
 * EV figures are "units of your original bet" (e.g. -0.21 = you lose 21 cents per $1 bet on average).
 */
(function (root) {
    'use strict';

    const SUITS = ['♠', '♥', '♦', '♣'];
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    function rankValue(rank) {
        if (rank === 'A') return 1;
        if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 10;
        return Number(rank);
    }

    // ---------- Shoe ----------

    function randomInt(n) {
        const c = root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
        if (c && c.getRandomValues) {
            const buf = new Uint32Array(1);
            const limit = Math.floor(0x100000000 / n) * n;
            do { c.getRandomValues(buf); } while (buf[0] >= limit);
            return buf[0] % n;
        }
        return Math.floor(Math.random() * n);
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = randomInt(i + 1);
            const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    let nextId = 1;
    function makeShoe(decks) {
        const cards = [];
        for (let d = 0; d < decks; d++)
            for (const suit of SUITS)
                for (const rank of RANKS)
                    cards.push({ rank, suit, value: rankValue(rank), id: nextId++ });
        return shuffle(cards);
    }

    // Composition of a full shoe, indexed by value (index 0 unused)
    function fullCounts(decks) {
        const c = new Array(11).fill(0);
        for (let v = 1; v <= 9; v++) c[v] = 4 * decks;
        c[10] = 16 * decks;
        return c;
    }

    // ---------- Hands ----------

    function handInfo(values) {
        let hard = 0, hasAce = false;
        for (const v of values) { hard += v; if (v === 1) hasAce = true; }
        const soft = hasAce && hard + 10 <= 21;
        return { hard, hasAce, soft, total: soft ? hard + 10 : hard, bust: hard > 21 };
    }

    // Hi-Lo card counting tag
    function hiLo(v) {
        if (v >= 2 && v <= 6) return 1;
        if (v === 1 || v === 10) return -1;
        return 0;
    }

    // ---------- Dealer outcome probabilities ----------
    // Returns [P(17), P(18), P(19), P(20), P(21), P(bust)] for the dealer's final hand,
    // given the up card, assuming the dealer has already peeked and does NOT have blackjack.
    // Uses the current shoe composition `p` for every draw (very close to exact for real shoes).
    function dealerDist(p, up, h17) {
        const memo = new Map();
        function rec(hard, ace) {
            if (hard > 21) return [0, 0, 0, 0, 0, 1];
            const soft = ace && hard + 10 <= 21;
            const best = soft ? hard + 10 : hard;
            if (best >= 17 && !(h17 && soft && best === 17)) {
                const out = [0, 0, 0, 0, 0, 0];
                out[best - 17] = 1;
                return out;
            }
            const key = hard * 2 + (ace ? 1 : 0);
            if (memo.has(key)) return memo.get(key);
            const out = [0, 0, 0, 0, 0, 0];
            for (let r = 1; r <= 10; r++) {
                if (!p[r]) continue;
                const sub = rec(hard + r, ace || r === 1);
                for (let i = 0; i < 6; i++) out[i] += p[r] * sub[i];
            }
            memo.set(key, out);
            return out;
        }

        // Hole card: the dealer peeked, so it can't complete a blackjack
        const q = p.slice();
        if (up === 1) q[10] = 0;
        if (up === 10) q[1] = 0;
        const qs = q.reduce((a, b) => a + b, 0) || 1;
        const out = [0, 0, 0, 0, 0, 0];
        for (let r = 1; r <= 10; r++) {
            if (!q[r]) continue;
            const sub = rec(up + r, up === 1 || r === 1);
            for (let i = 0; i < 6; i++) out[i] += (q[r] / qs) * sub[i];
        }
        return out;
    }

    // ---------- Full decision analysis ----------
    // opts: { values, up, counts (unknown cards by value), rules: {h17, das}, canDouble, canSplit, canSurrender }
    function analyze(opts) {
        const { values, up, counts, rules } = opts;
        const n = counts.reduce((a, b) => a + b, 0) || 1;
        const p = counts.map(c => c / n);
        const dd = dealerDist(p, up, rules.h17);

        function standOdds(t) {
            if (t > 21) return { win: 0, push: 0, lose: 1 };
            let win = dd[5], push = 0, lose = 0;
            for (let i = 0; i < 5; i++) {
                const d = 17 + i;
                if (d < t) win += dd[i];
                else if (d === t) push += dd[i];
                else lose += dd[i];
            }
            return { win, push, lose };
        }
        const standCache = {};
        function standEV(t) {
            if (t > 21) return -1;
            if (standCache[t] === undefined) {
                const o = standOdds(t);
                standCache[t] = o.win - o.lose;
            }
            return standCache[t];
        }
        const best = (hard, ace) => (ace && hard + 10 <= 21 ? hard + 10 : hard);

        // EV of hitting now and then playing perfectly (hit/stand only)
        const hitMemo = new Map();
        function hitEV(hard, ace) {
            const key = hard * 2 + (ace ? 1 : 0);
            if (hitMemo.has(key)) return hitMemo.get(key);
            let ev = 0;
            for (let r = 1; r <= 10; r++) {
                if (!p[r]) continue;
                const nh = hard + r, na = ace || r === 1;
                if (nh > 21) { ev -= p[r]; continue; }
                const b = best(nh, na);
                ev += p[r] * (b === 21 ? standEV(21) : Math.max(standEV(b), hitEV(nh, na)));
            }
            hitMemo.set(key, ev);
            return ev;
        }
        function doubleEV(hard, ace) {
            let ev = 0;
            for (let r = 1; r <= 10; r++) {
                if (!p[r]) continue;
                const nh = hard + r;
                ev += p[r] * (nh > 21 ? -1 : standEV(best(nh, ace || r === 1)));
            }
            return 2 * ev;
        }
        // Split: two hands, each starting from one card. Re-splits are ignored (a tiny effect).
        function splitEV(v) {
            let ev = 0;
            for (let r = 1; r <= 10; r++) {
                if (!p[r]) continue;
                const h = v + r, a = v === 1 || r === 1, b = best(h, a);
                let val;
                if (v === 1) val = standEV(b); // split aces get one card each
                else {
                    val = Math.max(standEV(b), b === 21 ? -Infinity : hitEV(h, a));
                    if (rules.das) val = Math.max(val, doubleEV(h, a));
                }
                ev += p[r] * val;
            }
            return 2 * ev;
        }

        const info = handInfo(values);
        const evs = { stand: standEV(info.total) };
        if (info.total < 21) evs.hit = hitEV(info.hard, info.hasAce);
        if (opts.canDouble) evs.double = doubleEV(info.hard, info.hasAce);
        if (opts.canSplit) evs.split = splitEV(values[0]);
        if (opts.canSurrender) evs.surrender = -0.5;

        let bestAction = 'stand';
        for (const k in evs) if (evs[k] > evs[bestAction] + 1e-12) bestAction = k;

        // One-card odds if you hit
        let bustIfHit = 0, madeIfHit = 0;
        for (let r = 1; r <= 10; r++) {
            const nh = info.hard + r;
            if (nh > 21) bustIfHit += p[r];
            else if (best(nh, info.hasAce || r === 1) >= 17) madeIfHit += p[r];
        }

        return {
            info,
            p,
            evs,
            bestAction,
            dealer: { dist: dd, bust: dd[5] },
            odds: { bustIfHit, madeIfHit, stand: standOdds(info.total) }
        };
    }

    // ---------- Basic strategy (4–8 decks, dealer peeks, late surrender) ----------
    // Column order: dealer 2,3,4,5,6,7,8,9,10,A
    // Codes: H hit, S stand, D double (else hit), X double (else stand),
    //        R surrender (else hit), Q surrender (else stand)
    // Pair codes: Y split, N don't split (use hard/soft chart), R surrender (else split)
    function charts(rules) {
        const h17 = !!rules.h17, das = rules.das !== false;
        return {
            hard: {
                8: 'HHHHHHHHHH',
                9: 'HDDDDHHHHH',
                10: 'DDDDDDDDHH',
                11: h17 ? 'DDDDDDDDDD' : 'DDDDDDDDDH',
                12: 'HHSSSHHHHH',
                13: 'SSSSSHHHHH',
                14: 'SSSSSHHHHH',
                15: h17 ? 'SSSSSHHHRR' : 'SSSSSHHHRH',
                16: 'SSSSSHHRRR',
                17: h17 ? 'SSSSSSSSSQ' : 'SSSSSSSSSS',
                18: 'SSSSSSSSSS'
            },
            soft: {
                12: 'HHHHHHHHHH',
                13: 'HHHDDHHHHH',
                14: 'HHHDDHHHHH',
                15: 'HHDDDHHHHH',
                16: 'HHDDDHHHHH',
                17: 'HDDDDHHHHH',
                18: h17 ? 'XXXXXSSHHH' : 'SXXXXSSHHH',
                19: h17 ? 'SSSSXSSSSS' : 'SSSSSSSSSS',
                20: 'SSSSSSSSSS',
                21: 'SSSSSSSSSS'
            },
            pair: {
                2: das ? 'YYYYYYNNNN' : 'NNYYYYNNNN',
                3: das ? 'YYYYYYNNNN' : 'NNYYYYNNNN',
                4: das ? 'NNNYYNNNNN' : 'NNNNNNNNNN',
                5: 'NNNNNNNNNN',
                6: das ? 'YYYYYNNNNN' : 'NYYYYNNNNN',
                7: 'YYYYYYNNNN',
                8: h17 ? 'YYYYYYYYYR' : 'YYYYYYYYYY',
                9: 'YYYYYNYYNN',
                10: 'NNNNNNNNNN',
                1: 'YYYYYYYYYY'
            }
        };
    }

    const colOf = up => (up === 1 ? 9 : up - 2);
    const hardRow = t => (t <= 8 ? 8 : t >= 18 ? 18 : t);
    const softRow = t => Math.max(12, Math.min(21, t));

    function resolve(code, flags) {
        switch (code) {
            case 'D': return flags.canDouble ? 'D' : 'H';
            case 'X': return flags.canDouble ? 'D' : 'S';
            case 'R': return flags.canSurrender ? 'R' : 'H';
            case 'Q': return flags.canSurrender ? 'R' : 'S';
            default: return code;
        }
    }

    // Returns { action: 'H'|'S'|'D'|'P'|'R', table, row, col, code }
    function basicStrategy(values, up, rules, flags) {
        const C = charts(rules);
        const col = colOf(up);
        const info = handInfo(values);
        const isPair = values.length === 2 && values[0] === values[1];

        if (isPair && flags.canSplit) {
            const code = C.pair[values[0]][col];
            if (code === 'R') return { action: flags.canSurrender ? 'R' : 'P', table: 'pair', row: values[0], col, code };
            if (code === 'Y') return { action: 'P', table: 'pair', row: values[0], col, code };
        }
        if (info.soft) {
            const row = softRow(info.total);
            const code = C.soft[row][col];
            return { action: resolve(code, flags), table: isPair && flags.canSplit ? 'pair' : 'soft', row: isPair && flags.canSplit ? values[0] : row, col, code };
        }
        const row = hardRow(info.total);
        const code = C.hard[row][col];
        return { action: resolve(code, flags), table: isPair && flags.canSplit ? 'pair' : 'hard', row: isPair && flags.canSplit ? values[0] : row, col, code };
    }

    // ---------- Explanations ----------

    const ACTION_NAMES = { H: 'Hit', S: 'Stand', D: 'Double Down', P: 'Split', R: 'Surrender' };
    const EV_KEYS = { H: 'hit', S: 'stand', D: 'double', P: 'split', R: 'surrender' };

    const pct = x => Math.round(x * 100) + '%';
    const fmtEV = x => (x >= 0.005 ? '+' : x <= -0.005 ? '−' : '') + Math.abs(x).toFixed(2);
    function upName(up) {
        if (up === 1) return 'an Ace';
        if (up === 8) return 'an 8';
        return 'a ' + up;
    }
    function pairName(v) {
        return v === 1 ? 'Aces' : v === 10 ? '10s' : v + 's';
    }
    function describeHand(values) {
        const info = handInfo(values);
        if (values.length === 2 && values[0] === values[1]) return 'a pair of ' + pairName(values[0]);
        return (info.soft ? 'soft ' : 'hard ') + info.total;
    }

    // Returns { text, tip }
    function explain(ctx) {
        const { an, strat, values, up, flags } = ctx;
        const info = an.info;
        const t = info.total;
        const U = upName(up);
        const db = an.dealer.bust;
        const pb = an.odds.bustIfHit;
        const ev = an.evs;
        const weak = up >= 2 && up <= 6;
        const isPair = values.length === 2 && values[0] === values[1];
        const v = values[0];
        const parts = [];
        let tip = '';

        // Pair the player chose not to split
        if (isPair && flags.canSplit && strat.action !== 'P') {
            if (v === 10) {
                parts.push(`Never split 10s. Your 20 wins about ${pct(an.odds.stand.win)} of the time against ${U} and only loses about ${pct(an.odds.stand.lose)}. Breaking up a 20 is a classic beginner mistake.`);
                return { text: parts.join(' '), tip: 'Always stand on 20 and never split 10s.' };
            }
            if (v === 5) parts.push('Never split 5s. Two 5s add up to 10, one of the best totals to double on, while a hand starting with one 5 is weak.');
            else if (v === 4) parts.push('Two 4s make 8. Splitting gives you two hands that each start with a weak 4, so play it as a hard 8.');
            else if (v === 9) {
                if (up === 7) parts.push(`Keep the 18. A dealer showing 7 usually finishes on 17, and your 18 beats that. You win about ${pct(an.odds.stand.win)} by standing.`);
                else parts.push(`Against ${U} the dealer will often reach 19 or 20. Splitting would only turn your 18 into two underdog hands.`);
                return { text: parts.join(' '), tip: 'Split 9s except against 7, 10 or Ace.' };
            } else parts.push(`Don't split ${pairName(v)} against ${U}. Two weak hands against a strong dealer card lose more money than one.`);
        }

        switch (strat.action) {
            case 'P':
                if (v === 1) {
                    parts.push('Two Aces together are just a soft 12, a weak hand. Split them: each Ace starts a new hand, and any 10-value card (about 31% of the deck) gives you 21. Most casinos give only one card to each split Ace, and it\'s still the right play.');
                    tip = 'Always split Aces.';
                } else if (v === 8) {
                    parts.push(`16 is the worst total in blackjack: if you hit you bust about ${pct(pb)} of the time, and if you stand you only win when the dealer busts. Two hands that start at 8 are much better than one 16.`);
                    if (!weak) parts.push(`Even against ${U}, splitting loses less money than playing the 16 (EV ${fmtEV(ev.split)} for both hands vs ${fmtEV(Math.max(ev.stand, ev.hit))}).`);
                    tip = 'Always split 8s.';
                } else if (v === 9) {
                    parts.push(`18 is decent, but against ${U} two hands starting at 9 are stronger. Each 9 has a good chance to reach 19 or more, and the dealer busts ${pct(db)} of the time from here.`);
                    tip = 'Split 9s except against 7, 10 or Ace.';
                } else if (v === 4) {
                    parts.push(`8 is a poor total, but ${U} is the dealer's weakest card (they bust about ${pct(db)}). Because you can double after splitting, each 4 can catch a 5, 6 or 7 and turn into a strong double down.`);
                    tip = 'Split 4s only against 5 or 6 (when you can double after splitting).';
                } else {
                    parts.push(`${t} is a weak total, but the dealer's ${U.replace(/^an? /, '')} is weak too, and they bust about ${pct(db)} of the time. Splitting puts two bets on the table while the dealer is in trouble, and each ${v} makes a better starting hand than ${t}.`);
                    tip = v === 6 ? 'Split 6s against 2 through 6.' : `Split ${v}s against 2 through 7.`;
                }
                break;

            case 'R': {
                const playEV = Math.max(ev.hit !== undefined ? ev.hit : -1, ev.stand, ev.split !== undefined ? ev.split : -1);
                parts.push(`${cap(describeHand(values))} against ${U} is a losing spot. Playing it out loses about ${Math.round(-playEV * 100)}¢ per $1 bet on average (EV ${fmtEV(playEV)}). Surrendering costs exactly half your bet (−0.50), which is cheaper, so give up half and keep the rest.`);
                tip = 'Surrender 16 against 9, 10 or Ace, and 15 against 10.';
                break;
            }

            case 'D':
                if (info.soft) {
                    parts.push(`Soft ${t} can't bust with one card because the Ace can count as 1. The dealer's ${U.replace(/^an? /, '')} busts about ${pct(db)} of the time, so this is a good time to get more money on the table. Even a bad card leaves you hoping for a dealer bust, and that's likely here.`);
                    tip = 'Double soft hands against the dealer\'s weakest cards (usually 4–6).';
                } else if (t === 11) {
                    parts.push(`11 is the best hand to double on. You can't bust, and any 10-value card (about ${pct(an.p[10])} of what's left) gives you 21. Against ${U}, doubling earns ${fmtEV(ev.double)} per original bet vs ${fmtEV(ev.hit)} for a plain hit.`);
                    tip = 'Double 11 against everything except an Ace (in most games).';
                } else if (t === 10) {
                    parts.push(`With 10 you can't bust, and a 10-value card (about ${pct(an.p[10])} of the shoe) gives you 20. The dealer's ${U.replace(/^an? /, '')} is weaker than your 10, so double while you're the favorite.`);
                    tip = 'Double 10 against 2 through 9.';
                } else {
                    parts.push(`9 isn't a great hand, but the dealer showing ${U.replace(/^an? /, '')} busts about ${pct(db)} of the time. Doubling turns that weakness into extra profit: ${fmtEV(ev.double)} vs ${fmtEV(ev.hit)} for a hit.`);
                    tip = 'Double 9 against 3 through 6.';
                }
                break;

            case 'S':
                if (info.soft) {
                    if (t >= 19) parts.push(`Soft ${t} is a strong hand. You win about ${pct(an.odds.stand.win)} of the time by standing.`);
                    else parts.push(`Soft 18 is good enough against ${U}. The dealer usually finishes on 17 or 18 from here, and standing wins or pushes about ${pct(an.odds.stand.win + an.odds.stand.push)} of the time.`);
                    tip = 'Stand on soft 19 and up. Soft 18 stands against 2, 7 and 8.';
                } else if (t >= 17) {
                    parts.push(`Hard ${t}: one more card busts you about ${pct(pb)} of the time. Standing isn't always a winner, but hitting is worse.`);
                    tip = 'Always stand on hard 17 or more.';
                } else {
                    parts.push(`The dealer's ${U.replace(/^an? /, '')} is a "bust card". They must keep hitting until 17 and will bust about ${pct(db)} of the time. If you hit your ${t}, you bust ${pct(pb)} of the time. Let the dealer take the risk instead.`);
                    tip = t === 12 ? 'Stand on 12 against 4, 5 and 6. Hit against everything else.' : 'Stand on 13–16 against 2 through 6.';
                }
                break;

            case 'H':
                if (strat.code === 'R' && !flags.canSurrender) parts.push('Surrender would be the best play here, but it isn\'t available (only on your first two cards, and only if the table allows it).');
                if (strat.code === 'D' && !flags.canDouble) parts.push('Doubling would be best, but you can only double on your first two cards (or after a split if allowed).');
                if (info.soft) {
                    if (t === 18) parts.push(`Soft 18 sounds good, but against ${U} the dealer often finishes on 19 or 20, and standing loses about ${pct(an.odds.stand.lose)} of the time. You can't bust with one card, so hit and try to improve.`);
                    else parts.push(`Soft ${t} can't bust on the next card because the Ace can drop to 1. A total under 17 only wins if the dealer busts, so improving costs you nothing.`);
                    tip = 'Never stand on soft 17 or less.';
                } else if (pb === 0 || t <= 11) {
                    parts.push(`You can't bust with one card from ${t}, and every card helps. Take a card.`);
                    tip = 'Always hit 11 or less when you don\'t double.';
                } else if (t === 12 && (up === 2 || up === 3)) {
                    parts.push(`12 against ${U} is a famous exception. Only 10-value cards bust you (${pct(pb)}), and the dealer's ${up} isn't weak enough to count on: they bust just ${pct(db)} of the time. Hitting is slightly better (${fmtEV(ev.hit)} vs ${fmtEV(ev.stand)}).`);
                    tip = 'Hit 12 against 2 or 3. Stand against 4–6.';
                } else {
                    parts.push(`The dealer's ${U.replace(/^an? /, '')} is strong. They finish with 17 or better about ${pct(1 - db)} of the time, so standing on ${t} only wins if they bust (${pct(db)}). Hitting risks a ${pct(pb)} bust, but it's the lesser evil: hit ${fmtEV(ev.hit)} vs stand ${fmtEV(ev.stand)}.`);
                    tip = 'Hit 12–16 against 7 through Ace.';
                }
                break;
        }
        if (strat.action === 'S' && strat.code === 'X' && !flags.canDouble)
            parts.unshift('Doubling would be best, but you can only double on your first two cards. The next best play is to stand.');
        if (strat.action === 'S' && strat.code === 'Q' && !flags.canSurrender)
            parts.unshift('Surrender would be slightly better, but it isn\'t available, so stand.');
        return { text: parts.join(' '), tip };
    }

    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // ---------- Rules-based house edge (rough, for the counting panel) ----------
    function baseEdge(rules, decks) {
        // Player edge in % for 6 decks, S17, DAS, no surrender ≈ -0.40%
        let e = -0.40;
        if (rules.h17) e -= 0.22;
        if (rules.das === false) e -= 0.14;
        if (rules.surrender) e += 0.07;
        e += ({ 1: 0.48, 2: 0.19, 4: 0.06, 6: 0, 8: -0.02 })[decks] || 0;
        return e;
    }

    const BJ = {
        SUITS, RANKS, makeShoe, fullCounts, handInfo, hiLo, dealerDist, analyze,
        charts, basicStrategy, explain, describeHand, baseEdge, colOf,
        ACTION_NAMES, EV_KEYS, fmtEV, pct
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = BJ;
    else root.BJ = BJ;
})(typeof window !== 'undefined' ? window : globalThis);
