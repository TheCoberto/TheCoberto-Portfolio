/* Blackjack Coach: game flow + UI. Odds, EV and strategy come from blackjack-engine.js (window.BJ). */
(function () {
    'use strict';
    const E = window.BJ;
    const $ = sel => document.querySelector(sel);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const money = n => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString(undefined, Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pct = x => (x * 100 < 1 && x > 0 ? '<1' : Math.round(x * 100)) + '%';
    const ACTION_NAMES = E.ACTION_NAMES;
    const EV_KEYS = E.EV_KEYS;
    const START_BANKROLL = 1000;
    const MIN_BET = 5;
    const STORE_KEY = 'thecoberto-blackjack-v1';

    // ---------- State ----------
    const defaults = {
        settings: { decks: 6, h17: false, das: true, surrender: true, mode: 'coach', count: false },
        bankroll: START_BANKROLL,
        lastBet: 25,
        stats: { decisions: 0, correct: 0, streak: 0, bestStreak: 0, hands: 0, wins: 0, losses: 0, pushes: 0, net: 0 }
    };
    const saved = load();
    const S = {
        settings: Object.assign({}, defaults.settings, saved.settings),
        bankroll: typeof saved.bankroll === 'number' ? saved.bankroll : defaults.bankroll,
        lastBet: saved.lastBet || defaults.lastBet,
        stats: Object.assign({}, defaults.stats, saved.stats),
        bet: 0,
        shoe: [], shoeSize: 0, shoeDecks: 0, cutCard: 0, seen: new Array(11).fill(0), rc: 0,
        dealer: [], hands: [], active: 0, insurance: 0,
        phase: 'bet',         // bet | dealing | insurance | play | dealer
        analysis: null,       // analysis for the current decision
        feedback: null,       // grade of the player's last decision
        roundSummary: null,
        busy: false
    };
    S.bet = Math.min(S.lastBet, Math.max(0, S.bankroll));

    function load() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
    }
    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({
                settings: S.settings, bankroll: S.bankroll, lastBet: S.lastBet, stats: S.stats
            }));
        } catch (e) { /* storage unavailable: play on without saving */ }
    }
    const rules = () => ({ h17: S.settings.h17, das: S.settings.das, surrender: S.settings.surrender });

    // ---------- Shoe & counting ----------
    function newShoe() {
        S.shoe = E.makeShoe(S.settings.decks);
        S.shoeSize = S.shoe.length;
        S.shoeDecks = S.settings.decks;
        S.cutCard = Math.floor(S.shoeSize * 0.25);
        S.seen = new Array(11).fill(0);
        S.rc = 0;
    }
    function see(card) {
        S.seen[card.value]++;
        S.rc += E.hiLo(card.value);
    }
    function draw(faceUp = true) {
        if (!S.shoe.length) newShoe();
        const c = S.shoe.pop();
        c.faceUp = faceUp;
        if (faceUp) see(c);
        return c;
    }
    // Cards the player hasn't seen yet (undealt shoe + dealer's hole card)
    function unknownCounts() {
        const full = E.fullCounts(S.shoeDecks);
        return full.map((n, i) => Math.max(0, n - S.seen[i]));
    }
    function countInfo() {
        const unknown = unknownCounts().reduce((a, b) => a + b, 0);
        const decksLeft = Math.max(unknown / 52, 0.25);
        const tc = S.rc / decksLeft;
        const edge = E.baseEdge(rules(), S.shoeDecks) + 0.5 * tc;
        return { rc: S.rc, tc, decksLeft, edge, unknown };
    }

    // ---------- Hand helpers ----------
    const values = cards => cards.map(c => c.value);
    const info = cards => E.handInfo(values(cards));
    const isBJ = hand => hand.cards.length === 2 && !hand.fromSplit && info(hand.cards).total === 21;
    const dealerUp = () => S.dealer[0].value;

    function flagsFor(hand) {
        const two = hand.cards.length === 2;
        return {
            canDouble: two && !hand.splitAces && S.bankroll >= hand.bet && (!hand.fromSplit || S.settings.das),
            canSplit: two && hand.cards[0].value === hand.cards[1].value && S.hands.length < 4 && S.bankroll >= hand.bet && !hand.splitAces,
            canSurrender: S.settings.surrender && two && S.hands.length === 1 && !hand.fromSplit
        };
    }

    // ---------- Round flow ----------
    async function deal() {
        if (S.busy || S.phase !== 'bet') return;
        if (S.bet < MIN_BET || S.bet > S.bankroll) { setMessage(S.bankroll < MIN_BET ? 'Out of chips. Reset your bankroll under Rules.' : 'Place a bet first.'); return; }
        S.busy = true;
        let shuffled = false;
        if (!S.shoe.length || S.shoe.length <= S.cutCard || S.shoeDecks !== S.settings.decks) { newShoe(); shuffled = true; }

        S.bankroll -= S.bet;
        S.lastBet = S.bet;
        S.hands = [{ cards: [], bet: S.bet }];
        S.dealer = [];
        S.active = 0;
        S.insurance = 0;
        S.feedback = null;
        S.roundSummary = null;
        S.analysis = null;
        S.phase = 'dealing';
        setMessage(shuffled ? 'New shoe shuffled. The count starts at 0.' : '');
        render();

        const steps = [
            () => S.hands[0].cards.push(draw()),
            () => S.dealer.push(draw()),
            () => S.hands[0].cards.push(draw()),
            () => S.dealer.push(draw(false))
        ];
        for (const step of steps) { await sleep(260); step(); render(); }
        await sleep(200);

        if (dealerUp() === 1 && S.bankroll >= S.hands[0].bet / 2) {
            S.phase = 'insurance';
            S.busy = false;
            render();
            return;
        }
        S.busy = false;
        await afterInsurance();
    }

    async function insuranceDecision(take) {
        if (S.phase !== 'insurance' || S.busy) return;
        const ci = countInfo();
        const p10 = unknownCounts()[10] / ci.unknown;
        const insEV = 3 * p10 - 1;              // pays 2:1, per unit of insurance bet
        const shouldTake = ci.tc >= 3;          // the Hi-Lo index for insurance
        const correct = take === shouldTake;
        recordDecision(correct);
        S.feedback = {
            correct,
            situation: 'Insurance against a dealer Ace',
            chosen: take ? 'Take insurance' : 'No insurance',
            recommended: shouldTake ? 'Take insurance' : 'No insurance',
            text: insuranceWhy(p10, insEV, ci.tc),
            evLine: `Insurance EV right now: ${E.fmtEV(insEV)} per $1 insured.`
        };
        if (take) {
            S.insurance = S.hands[0].bet / 2;
            S.bankroll -= S.insurance;
        }
        await afterInsurance();
    }

    function insuranceWhy(p10, insEV, tc) {
        return `Insurance is a side bet that the dealer's hole card is a 10. It pays 2 to 1, so it only breaks even if more than 1 in 3 (33.3%) of the unseen cards are 10s. Right now ${pct(p10)} are. ` +
            (insEV > 0
                ? 'The shoe is rich in 10s, so this is one of the rare times insurance is a good bet. Card counters take it at a Hi-Lo true count of +3 or more.'
                : `Basic strategy says never take it. The exception is card counters, who take it at a true count of +3 or more (it's ${tc >= 0 ? '+' : ''}${tc.toFixed(1)} now).`) +
            ' "Even money" on a blackjack is the same bet under another name.';
    }

    async function afterInsurance() {
        S.busy = true;
        S.phase = 'dealing';
        render();
        const up = dealerUp();
        const dealerBJ = info(S.dealer).total === 21;
        const hand = S.hands[0];

        if (up === 1 || up === 10) {
            setMessage('Dealer checks for blackjack…');
            render();
            await sleep(650);
            if (dealerBJ) {
                revealHole();
                if (S.insurance) S.bankroll += S.insurance * 3;
                setMessage('Dealer has blackjack.' + (S.insurance ? ' Your insurance pays 2 to 1.' : ''));
                finishRound();
                return;
            }
            setMessage(S.insurance ? 'No dealer blackjack. Insurance loses.' : 'No dealer blackjack.');
        }
        if (isBJ(hand)) {
            revealHole();
            setMessage('Blackjack!');
            finishRound();
            return;
        }
        S.phase = 'play';
        S.busy = false;
        prepareDecision();
        render();
    }

    function prepareDecision() {
        const hand = S.hands[S.active];
        const flags = flagsFor(hand);
        const vals = values(hand.cards);
        const up = dealerUp();
        const an = E.analyze({ values: vals, up, counts: unknownCounts(), rules: rules(), ...flags });
        const strat = E.basicStrategy(vals, up, rules(), flags);
        const why = E.explain({ an, strat, values: vals, up, flags });
        S.analysis = { an, strat, why, flags, vals, up };
    }

    function recordDecision(correct) {
        const st = S.stats;
        st.decisions++;
        if (correct) { st.correct++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); }
        else st.streak = 0;
        save();
    }

    function gradeAction(action) {
        const a = S.analysis;
        if (!a) return;
        const correct = action === a.strat.action;
        recordDecision(correct);
        const evChosen = a.an.evs[EV_KEYS[action]];
        const evRec = a.an.evs[EV_KEYS[a.strat.action]];
        S.feedback = {
            correct,
            situation: `${cap(E.describeHand(a.vals))} vs dealer ${upLabel(a.up)}`,
            chosen: ACTION_NAMES[action],
            recommended: ACTION_NAMES[a.strat.action],
            text: a.why.text,
            tip: a.why.tip,
            evLine: correct || evChosen === undefined || evRec === undefined ? '' :
                `${ACTION_NAMES[action]} ${E.fmtEV(evChosen)} vs ${ACTION_NAMES[a.strat.action]} ${E.fmtEV(evRec)}. That's about ${money(Math.abs(evRec - evChosen) * 100)} lost per $100 bet over the long run.`
        };
    }

    async function act(action) {
        if (S.phase !== 'play' || S.busy) return;
        const hand = S.hands[S.active];
        const flags = flagsFor(hand);
        if ((action === 'D' && !flags.canDouble) || (action === 'P' && !flags.canSplit) || (action === 'R' && !flags.canSurrender)) return;
        S.busy = true;
        setMessage('');
        gradeAction(action);

        switch (action) {
            case 'H':
                hand.cards.push(draw());
                if (info(hand.cards).total >= 21) hand.done = true;
                break;
            case 'S':
                hand.done = true;
                break;
            case 'D':
                S.bankroll -= hand.bet;
                hand.bet *= 2;
                hand.doubled = true;
                hand.cards.push(draw());
                hand.done = true;
                break;
            case 'R':
                hand.surrendered = true;
                hand.done = true;
                break;
            case 'P': {
                S.bankroll -= hand.bet;
                const aces = hand.cards[0].value === 1;
                const second = { cards: [hand.cards.pop()], bet: hand.bet, fromSplit: true, splitAces: aces };
                hand.fromSplit = true;
                hand.splitAces = aces;
                S.hands.splice(S.active + 1, 0, second);
                render();
                await sleep(260);
                hand.cards.push(draw());
                if (aces) {
                    render();
                    await sleep(260);
                    second.cards.push(draw());
                    hand.done = second.done = true;
                } else if (info(hand.cards).total === 21) hand.done = true;
                break;
            }
        }
        render();
        await sleep(240);
        await advance();
    }

    // Move to the next unfinished hand, or to the dealer
    async function advance() {
        while (S.active < S.hands.length && S.hands[S.active].done) {
            S.active++;
            const h = S.hands[S.active];
            if (h && h.cards.length === 1) {
                render();
                await sleep(260);
                h.cards.push(draw());
                if (info(h.cards).total === 21) h.done = true;
            }
        }
        if (S.active < S.hands.length) {
            S.busy = false;
            prepareDecision();
            render();
            return;
        }
        await dealerTurn();
    }

    function revealHole() {
        const hole = S.dealer[1];
        if (hole && !hole.faceUp) { hole.faceUp = true; see(hole); }
    }

    async function dealerTurn() {
        S.phase = 'dealer';
        S.analysis = null;
        render();
        await sleep(350);
        revealHole();
        render();
        const live = S.hands.some(h => !h.surrendered && !info(h.cards).bust);
        if (live) {
            const h17 = S.settings.h17;
            for (;;) {
                const d = info(S.dealer);
                if (d.total > 17 || (d.total === 17 && !(h17 && d.soft))) break;
                await sleep(550);
                S.dealer.push(draw());
                render();
            }
        }
        await sleep(300);
        finishRound();
    }

    function finishRound() {
        revealHole();
        const d = info(S.dealer);
        const dealerBJ = S.dealer.length === 2 && d.total === 21;
        let net = -S.hands.reduce((a, h) => a + h.bet, 0);
        for (const h of S.hands) {
            const p = info(h.cards);
            let ret = 0;
            if (h.surrendered) { ret = h.bet / 2; h.result = 'Surrendered'; }
            else if (p.bust) { h.result = 'Bust'; }
            else if (isBJ(h) && !dealerBJ) { ret = h.bet * 2.5; h.result = 'Blackjack!'; }
            else if (dealerBJ) { ret = isBJ(h) ? h.bet : 0; h.result = isBJ(h) ? 'Push' : 'Lose'; }
            else if (d.bust || p.total > d.total) { ret = h.bet * 2; h.result = 'Win'; }
            else if (p.total === d.total) { ret = h.bet; h.result = 'Push'; }
            else h.result = 'Lose';
            S.bankroll += ret;
            net += ret;
            const st = S.stats;
            if (h.result === 'Push') st.pushes++;
            else if (ret > h.bet) st.wins++;
            else st.losses++;
        }
        if (S.insurance) net += dealerBJ ? S.insurance * 2 : -S.insurance;
        S.stats.hands++;
        S.stats.net += net;
        S.roundSummary = { net, dealerTotal: d.bust ? 'Bust' : d.total };
        const msg = net > 0 ? `You won ${money(net)}` : net < 0 ? `You lost ${money(-net)}` : 'Push: your bet comes back';
        setMessage((S.message ? S.message + ' ' : '') + msg + '.');
        S.phase = 'bet';
        S.busy = false;
        S.analysis = null;
        S.bet = Math.min(S.lastBet, S.bankroll);
        if (S.bet < MIN_BET) S.bet = 0;
        save();
        render();
    }

    // ---------- Rendering ----------
    function setMessage(m) { S.message = m; }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function upLabel(v) { return v === 1 ? 'Ace' : String(v); }
    function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

    const rendered = new Set(); // card ids already on screen, so only new cards animate

    function cardHTML(c) {
        const isNew = !rendered.has(c.id + (c.faceUp ? 'u' : 'd'));
        rendered.add(c.id + (c.faceUp ? 'u' : 'd'));
        if (!c.faceUp) return `<div class="card back${isNew ? ' deal-in' : ''}"></div>`;
        const red = c.suit === '♥' || c.suit === '♦';
        const tag = E.hiLo(c.value);
        const tagHTML = S.settings.count ? `<span class="hl-tag ${tag > 0 ? 'plus' : tag < 0 ? 'minus' : 'zero'}">${tag > 0 ? '+1' : tag < 0 ? '−1' : '0'}</span>` : '';
        return `<div class="card${red ? ' red' : ''}${isNew ? ' deal-in' : ''}">
            <span class="corner tl">${c.rank}<br>${c.suit}</span>
            <span class="pip">${c.suit}</span>
            <span class="corner br">${c.rank}<br>${c.suit}</span>${tagHTML}</div>`;
    }

    // `final`: the hand is finished, so show one number instead of "7 / 17"
    function totalText(cards, final) {
        const i = info(cards);
        if (i.bust) return 'Bust ' + i.hard;
        return i.soft && i.total !== 21 && !final ? `${i.total - 10} / ${i.total}` : String(i.total);
    }

    function renderTable() {
        // Dealer
        $('#dealer-cards').innerHTML = S.dealer.map(cardHTML).join('');
        const dt = $('#dealer-total');
        if (S.dealer.length) {
            const visible = S.dealer.filter(c => c.faceUp);
            dt.textContent = visible.length === S.dealer.length ? totalText(S.dealer, S.phase === 'bet') : totalText(visible);
            dt.classList.remove('hidden');
        } else dt.classList.add('hidden');

        // Player
        const wrap = $('#player-hands');
        if (!S.hands.length) {
            wrap.innerHTML = '<div class="empty-hand">Pick your chips, then press <b>Deal</b>.</div>';
        } else {
            wrap.innerHTML = S.hands.map((h, i) => {
                const activeCls = S.phase === 'play' && i === S.active && S.hands.length > 1 ? ' active' : '';
                const res = h.result ? `<span class="result ${resultClass(h.result)}">${h.result}</span>` : '';
                return `<div class="hand${activeCls}">
                    <div class="cards">${h.cards.map(cardHTML).join('')}</div>
                    <div class="hand-meta">
                        <span class="total-pill">${h.cards.length ? totalText(h.cards, h.done || S.phase === 'bet') : ''}</span>
                        <span class="bet-chip">${money(h.bet)}${h.doubled ? ' ×2' : ''}</span>
                        ${res}
                    </div>
                </div>`;
            }).join('');
        }
        $('#message').textContent = S.message || '';
        $('#rules-print').textContent = (S.settings.h17 ? 'Dealer hits soft 17' : 'Dealer stands on all 17s') + ` · ${S.settings.decks} deck${S.settings.decks > 1 ? 's' : ''}`;
    }
    function resultClass(r) {
        if (r === 'Win' || r === 'Blackjack!') return 'win';
        if (r === 'Push') return 'push';
        return 'lose';
    }

    function renderControls() {
        $('#bankroll').textContent = money(S.bankroll);
        $('#bet').textContent = money(S.bet);
        const betting = S.phase === 'bet';
        $('#bet-controls').classList.toggle('hidden', !betting);
        $('#insurance-controls').classList.toggle('hidden', S.phase !== 'insurance');
        $('#play-controls').classList.toggle('hidden', S.phase !== 'play');
        $('#deal-btn').disabled = S.bet < MIN_BET || S.busy;
        document.querySelectorAll('.chip').forEach(ch => { ch.disabled = S.bet + Number(ch.dataset.chip) > S.bankroll; });

        if (S.phase === 'play') {
            const flags = flagsFor(S.hands[S.active]);
            const rec = S.settings.mode === 'coach' && S.analysis ? S.analysis.strat.action : null;
            document.querySelectorAll('[data-act]').forEach(b => {
                const a = b.dataset.act;
                b.disabled = S.busy || (a === 'D' && !flags.canDouble) || (a === 'P' && !flags.canSplit) || (a === 'R' && !flags.canSurrender);
                b.classList.toggle('recommended', a === rec);
                b.classList.toggle('hidden', a === 'R' && !S.settings.surrender);
            });
        }
        if (S.phase === 'insurance') {
            const ci = countInfo();
            const take = ci.tc >= 3;
            document.querySelectorAll('[data-ins]').forEach(b => {
                b.classList.toggle('recommended', S.settings.mode === 'coach' && (b.dataset.ins === 'yes') === take);
            });
        }
        document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === S.settings.mode));
        $('#count-toggle').checked = S.settings.count;
    }

    function renderCoach() {
        const coach = S.settings.mode === 'coach';
        const out = [];

        if (S.feedback) out.push(feedbackHTML(S.feedback));

        if (S.phase === 'play' && S.analysis) out.push(decisionHTML(S.analysis, coach));
        else if (S.phase === 'insurance') out.push(insuranceHTML(coach));
        else if (S.phase === 'bet') out.push(betTipHTML());

        if (S.settings.count) out.push(countHTML());
        out.push(statsHTML());
        $('#coach').innerHTML = out.join('');
    }

    function feedbackHTML(f) {
        return `<div class="panel feedback ${f.correct ? 'good' : 'bad'}">
            <div class="fb-head">${f.correct ? '✓ Correct' : '✗ Not quite'}<span class="fb-sit">${esc(f.situation)}</span></div>
            <div class="fb-body">${f.correct
                ? `<b>${esc(f.chosen)}</b> was the right play.`
                : `You chose <b>${esc(f.chosen)}</b>. Basic strategy says <b>${esc(f.recommended)}</b>.`}</div>
            ${f.correct ? '' : `<p class="why">${esc(f.text)}</p>`}
            ${f.evLine ? `<p class="ev-line">${esc(f.evLine)}</p>` : ''}
            ${f.tip && !f.correct ? `<p class="tip"><span>Rule of thumb</span>${esc(f.tip)}</p>` : ''}
        </div>`;
    }

    function decisionHTML(a, coach) {
        const { an, strat, why } = a;
        const sit = `${cap(E.describeHand(a.vals))} vs dealer ${upLabel(a.up)}`;
        const parts = [`<div class="panel"><div class="panel-title">Your decision</div><div class="situation">${esc(sit)}</div>`];

        if (coach) {
            parts.push(`<div class="rec"><span class="rec-label">Best play</span><span class="rec-action a-${strat.action}">${ACTION_NAMES[strat.action]}</span></div>
                <p class="why">${esc(why.text)}</p>
                ${why.tip ? `<p class="tip"><span>Rule of thumb</span>${esc(why.tip)}</p>` : ''}`);
        } else {
            parts.push('<p class="quiz">What would you do? Make your move, and the coach will grade it.</p>');
        }
        parts.push('</div>');

        // Odds
        const o = an.odds, dd = an.dealer.dist;
        const bars = ['17', '18', '19', '20', '21', 'Bust'].map((lbl, i) => `
            <div class="bar-row${i === 5 ? ' bust' : ''}"><span class="bar-lbl">${lbl}</span>
            <span class="bar"><span style="width:${(dd[i] * 100).toFixed(1)}%"></span></span>
            <span class="bar-val">${pct(dd[i])}</span></div>`).join('');
        parts.push(`<div class="panel"><div class="panel-title">The odds</div>
            <div class="odds-grid">
                ${an.info.total < 21 ? `<div class="odd"><div class="odd-val ${o.bustIfHit > 0.5 ? 'hot' : ''}">${pct(o.bustIfHit)}</div><div class="odd-lbl">bust if you hit</div></div>
                <div class="odd"><div class="odd-val">${pct(o.madeIfHit)}</div><div class="odd-lbl">reach 17–21 in one card</div></div>` : ''}
                <div class="odd"><div class="odd-val">${pct(o.stand.win)}</div><div class="odd-lbl">win if you stand</div></div>
                <div class="odd"><div class="odd-val">${pct(o.stand.lose)}</div><div class="odd-lbl">lose if you stand</div></div>
            </div>
            <div class="sub-title">Where the dealer's ${upLabel(a.up)} ends up</div>
            <div class="bars">${bars}</div>
        </div>`);

        // EV
        if (coach) {
            const order = ['hit', 'stand', 'double', 'split', 'surrender'];
            const keys = order.filter(k => an.evs[k] !== undefined);
            const recKey = EV_KEYS[strat.action];
            const rows = keys.map(k => {
                const v = an.evs[k];
                const name = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender' }[k];
                return `<div class="ev-row${k === recKey ? ' best' : ''}"><span>${name}</span>
                    <span class="ev-num ${v >= 0 ? 'pos' : 'neg'}">${E.fmtEV(v)}</span>
                    <span class="ev-money">${v >= 0 ? '+' : '−'}$${Math.abs(v * 100).toFixed(0)} per $100</span></div>`;
            }).join('');
            let note = '';
            const evBest = an.bestAction;
            if (evBest !== recKey && an.evs[evBest] - an.evs[recKey] > 0.02) {
                note = `<p class="note">With the cards left in this shoe, the math slightly favors <b>${cap(evBest)}</b> right now. Card counters make adjustments like this. If you're learning, stick with basic strategy.</p>`;
            }
            parts.push(`<div class="panel"><div class="panel-title">Expected value</div>
                <p class="mini">What each move returns on average per $1 bet, if you played this exact spot forever.</p>
                <div class="ev-table">${rows}</div>${note}</div>`);
        }
        return parts.join('');
    }

    function insuranceHTML(coach) {
        const ci = countInfo();
        const p10 = unknownCounts()[10] / ci.unknown;
        const insEV = 3 * p10 - 1;
        const take = ci.tc >= 3;
        return `<div class="panel"><div class="panel-title">Insurance?</div>
            <div class="situation">Dealer shows an Ace</div>
            ${coach ? `<div class="rec"><span class="rec-label">Best play</span><span class="rec-action ${take ? 'a-D' : 'a-S'}">${take ? 'Take it' : 'No insurance'}</span></div>
            <p class="why">${esc(insuranceWhy(p10, insEV, ci.tc))}</p>
            <p class="ev-line">Insurance EV: ${E.fmtEV(insEV)} per $1 insured.</p>`
            : '<p class="quiz">Insurance or not? Decide, then see the answer.</p>'}
        </div>`;
    }

    function betTipHTML() {
        const coach = S.settings.mode === 'coach';
        let html = '<div class="panel"><div class="panel-title">' + (S.roundSummary ? 'Hand over' : 'How this works') + '</div>';
        if (S.roundSummary) {
            const n = S.roundSummary.net;
            html += `<div class="situation ${n > 0 ? 'pos' : n < 0 ? 'neg' : ''}">${n > 0 ? 'Won ' + money(n) : n < 0 ? 'Lost ' + money(-n) : 'Push'}</div>
                <p class="mini">Remember, good decisions still lose some hands. Blackjack is played over thousands of hands, and correct play is what keeps the house edge around half a percent.</p>`;
        }
        html += coach
            ? '<p class="mini"><b>Coach mode:</b> the best move is highlighted before you act, with the odds, the expected value of every option, and the reason why.</p>'
            : '<p class="mini"><b>Practice mode:</b> the answer is hidden. Play your hand and you\'ll be graded on every decision. The odds stay visible to help you think it through.</p>';
        html += '<p class="mini">Keys: <kbd>H</kbd> hit · <kbd>S</kbd> stand · <kbd>D</kbd> double · <kbd>P</kbd> split · <kbd>R</kbd> surrender · <kbd>Enter</kbd> deal</p></div>';
        return html;
    }

    function countHTML() {
        const ci = countInfo();
        const tcR = Math.trunc(ci.tc);
        let bet = 'Bet the minimum', units = 1;
        if (tcR >= 4) { bet = 'Big bet (8 units)'; units = 8; }
        else if (tcR === 3) { bet = 'Raise to 4 units'; units = 4; }
        else if (tcR === 2) { bet = 'Raise to 2 units'; units = 2; }
        const pen = S.shoeSize ? 1 - S.shoe.length / S.shoeSize : 0;
        const sign = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x);
        return `<div class="panel count"><div class="panel-title">Card count (Hi-Lo)</div>
            <div class="odds-grid">
                <div class="odd"><div class="odd-val">${sign(ci.rc)}</div><div class="odd-lbl">running count</div></div>
                <div class="odd"><div class="odd-val">${sign(Number(ci.tc.toFixed(1)))}</div><div class="odd-lbl">true count</div></div>
                <div class="odd"><div class="odd-val">${ci.decksLeft.toFixed(1)}</div><div class="odd-lbl">decks left</div></div>
                <div class="odd"><div class="odd-val ${ci.edge > 0 ? 'good' : ''}">${ci.edge > 0 ? '+' : '−'}${Math.abs(ci.edge).toFixed(1)}%</div><div class="odd-lbl">your edge (≈)</div></div>
            </div>
            <div class="count-advice"><span>Counter's bet</span><b>${bet}</b>${units > 1 ? ' <span class="good-txt">(the remaining cards favor you)</span>' : ''}</div>
            <div class="shoe-bar" title="How much of the shoe has been dealt"><span style="width:${(pen * 100).toFixed(0)}%"></span><i style="left:75%"></i></div>
            <p class="mini">Cards 2–6 are <b class="plus">+1</b>, 7–9 are <b>0</b>, and 10s and Aces are <b class="minus">−1</b>. Divide the running count by the decks left to get the <b>true count</b>. Each +1 of true count adds about 0.5% to your edge. A high count means lots of 10s and Aces are left, which means more blackjacks (paid 3 to 2) and more dealer busts.</p>
        </div>`;
    }

    function statsHTML() {
        const st = S.stats;
        const acc = st.decisions ? Math.round(st.correct / st.decisions * 100) + '%' : '—';
        return `<div class="panel stats"><div class="panel-title">Your stats</div>
            <div class="stat-grid">
                <div><b>${acc}</b><span>accuracy</span></div>
                <div><b>${st.correct}/${st.decisions}</b><span>correct moves</span></div>
                <div><b>${st.streak}</b><span>streak (best ${st.bestStreak})</span></div>
                <div><b>${st.hands}</b><span>hands</span></div>
                <div><b>${st.wins}-${st.losses}-${st.pushes}</b><span>W-L-P</span></div>
                <div><b class="${st.net > 0 ? 'pos' : st.net < 0 ? 'neg' : ''}">${money(st.net)}</b><span>net</span></div>
            </div></div>`;
    }

    function render() {
        renderTable();
        renderControls();
        renderCoach();
    }

    // ---------- Strategy chart ----------
    function renderChart() {
        const C = E.charts(rules());
        const r = rules();
        const cols = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
        const hi = S.phase === 'play' && S.analysis ? S.analysis.strat : null;

        const disp = code => {
            switch (code) {
                case 'H': return ['H', 'H'];
                case 'S': return ['S', 'S'];
                case 'D': return ['D', 'D'];
                case 'X': return ['Ds', 'D'];
                case 'R': return r.surrender ? ['Rh', 'R'] : ['H', 'H'];
                case 'Q': return r.surrender ? ['Rs', 'R'] : ['S', 'S'];
                default: return [code, code];
            }
        };
        function table(title, key, rows) {
            let h = `<table class="chart"><caption>${title}</caption><thead><tr><th>You</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;
            for (const [label, rowKey, codesFn] of rows) {
                h += `<tr><th>${label}</th>`;
                for (let i = 0; i < 10; i++) {
                    const [txt, cls] = codesFn(i);
                    const isHi = hi && hi.table === key && String(hi.row) === String(rowKey) && hi.col === i;
                    h += `<td class="cell ${cls}${isHi ? ' hi' : ''}">${txt}</td>`;
                }
                h += '</tr>';
            }
            return h + '</tbody></table>';
        }
        const hardRows = [[ '8 or less', 8 ], [9, 9], [10, 10], [11, 11], [12, 12], [13, 13], [14, 14], [15, 15], [16, 16], [17, 17], ['18+', 18]]
            .map(([lbl, k]) => [lbl, k, i => disp(C.hard[k][i])]);
        const softRows = [13, 14, 15, 16, 17, 18, 19, 20]
            .map(k => [`A,${k - 11}`, k, i => disp(C.soft[k][i])]);
        const pairRows = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1].map(v => {
            const lbl = v === 1 ? 'A,A' : `${v},${v}`;
            return [lbl, v, i => {
                const code = C.pair[v][i];
                if (code === 'Y') return ['P', 'P'];
                if (code === 'R') return r.surrender ? ['Rp', 'R'] : ['P', 'P'];
                // Not a split: play the pair as its hard total
                return disp(C.hard[Math.min(18, Math.max(8, v * 2))][i]);
            }];
        });
        $('#chart-body').innerHTML = `<div class="chart-grid">${table('Hard totals', 'hard', hardRows)}${table('Soft totals', 'soft', softRows)}${table('Pairs', 'pair', pairRows)}</div>`;
        $('#chart-sub').textContent = `For ${S.settings.decks} deck${S.settings.decks > 1 ? 's' : ''}, ${r.h17 ? 'dealer hits soft 17' : 'dealer stands on soft 17'}, ${r.das ? 'double after split' : 'no double after split'}, ${r.surrender ? 'late surrender' : 'no surrender'}. Columns show the dealer's up card.` +
            (hi ? ' Your current spot is outlined.' : '') + (S.settings.decks <= 2 ? ' (This chart is built for 4 to 8 decks. Single and double deck differ in a few close spots.)' : '');
    }

    // ---------- Events ----------
    document.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
        if (S.phase !== 'bet') return;
        const v = Number(ch.dataset.chip);
        if (S.bet + v <= S.bankroll) { S.bet += v; renderControls(); }
    }));
    $('#clear-bet').addEventListener('click', () => { if (S.phase === 'bet') { S.bet = 0; renderControls(); } });
    $('#deal-btn').addEventListener('click', deal);
    document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => act(b.dataset.act)));
    document.querySelectorAll('[data-ins]').forEach(b => b.addEventListener('click', () => insuranceDecision(b.dataset.ins === 'yes')));
    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
        S.settings.mode = b.dataset.mode; save(); render();
    }));
    $('#count-toggle').addEventListener('change', e => {
        S.settings.count = e.target.checked; save(); rendered.clear(); render();
    });

    const chartDlg = $('#chart-dialog'), setDlg = $('#settings-dialog');
    $('#chart-btn').addEventListener('click', () => { renderChart(); chartDlg.showModal(); });
    $('#settings-btn').addEventListener('click', () => {
        const f = $('#settings-form');
        f.decks.value = String(S.settings.decks);
        f.h17.value = S.settings.h17 ? '1' : '0';
        f.das.checked = S.settings.das;
        f.surrender.checked = S.settings.surrender;
        setDlg.showModal();
    });
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
    [chartDlg, setDlg].forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

    $('#settings-form').addEventListener('change', () => {
        const f = $('#settings-form');
        S.settings.decks = Number(f.decks.value);
        S.settings.h17 = f.h17.value === '1';
        S.settings.das = f.das.checked;
        S.settings.surrender = f.surrender.checked;
        save();
        if (S.phase === 'play') prepareDecision();
        render();
    });
    $('#reset-btn').addEventListener('click', () => {
        if (!confirm('Reset your bankroll to $1,000 and clear your stats?')) return;
        S.bankroll = START_BANKROLL;
        S.stats = Object.assign({}, defaults.stats);
        S.bet = Math.min(S.lastBet, S.bankroll);
        S.feedback = null;
        S.roundSummary = null;
        save();
        render();
    });

    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
        const k = e.key.toLowerCase();
        if (S.phase === 'play' && 'hsdpr'.includes(k) && k.length === 1) {
            act({ h: 'H', s: 'S', d: 'D', p: 'P', r: 'R' }[k]);
        } else if (S.phase === 'insurance' && (k === 'y' || k === 'n')) {
            insuranceDecision(k === 'y');
        } else if (S.phase === 'bet' && (k === 'enter' || k === ' ') && document.activeElement.tagName !== 'BUTTON') {
            e.preventDefault();
            deal();
        }
    });

    render();
})();
