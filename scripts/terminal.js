// CobertOS terminal: a small fake shell on the home page.
(() => {
    const out = document.getElementById("term-output");
    const input = document.getElementById("term-input");
    const term = document.getElementById("terminal");
    if (!out || !input || !term) return;

    // Places you can "open" or "cd" into. Internal pages open in this tab, external ones in a new tab.
    const PLACES = {
        home:        { url: "index.html",        desc: "CobertOS dashboard" },
        videos:      { url: "videos.html",       desc: "YouTube, Twitch, Kick & Rumble" },
        music:       { url: "music.html",        desc: "CASTAFRAY electronic project" },
        software:    { url: "software.html",     desc: "Apps, games & mods" },
        apps:        { url: "apps.html",         desc: "Browser apps" },
        games:       { url: "games.html",        desc: "Games & projects" },
        mods:        { url: "mods.html",         desc: "Minecraft Bedrock add-ons" },
        photos:      { url: "photography.html",  desc: "Photography gallery" },
        discord:     { url: "discord.html",      desc: "Communities & servers" },
        contact:     { url: "contact.html",      desc: "Questions, collabs & business" },
        crobus:      { url: "broken_crown.html", desc: "KINGDOM OF CROBUS Minecraft server" },
        blackjack:   { url: "blackjack.html",    desc: "Blackjack Coach" },
        dice:        { url: "dice.html",         desc: "Dice Roller" },
        rng:         { url: "rng.html",          desc: "Random Number Generator" },
        coffee:      { url: "coffee.html",       desc: "Coffee Calculator" },
        visualizer:  { url: "visualizer.html",   desc: "Andrew Jackson Bass Visualizer" },
        lethal:      { url: "https://thecoberto.github.io/lethal/",      desc: "How dangerous is anywhere?" },
        villagerify: { url: "https://thecoberto.github.io/villagerify/", desc: "Turn your face into a villager" },
        map:         { url: "http://crobus.minecraft.best:8100",         desc: "KINGDOM OF CROBUS live map" },
        github:      { url: "https://github.com/TheCoberto",             desc: "Source code" },
        mcpedl:      { url: "https://mcpedl.com/user/thecoberto/",       desc: "Minecraft add-ons" },
        curseforge:  { url: "https://www.curseforge.com/members/thecoberto/projects", desc: "CurseForge projects" },
        beverages:   { url: "https://mcpedl.com/beverages/",           desc: "Beverages add-on" },
        "skeleton-variants": { url: "https://mcpedl.com/skeleton-variants/", desc: "Skeleton Variants add-on" },
        "cleanup-utility":   { url: "https://mcpedl.com/cleanup-function/",  desc: "Cleanup Utility script" },
        youtube:     { url: "https://youtube.com/TheCoberto",            desc: "TheCoberto on YouTube" },
        thecrobus:   { url: "https://www.youtube.com/@TheCrobus",        desc: "TheCrobus on YouTube" },
        twitch:      { url: "https://www.twitch.tv/crobuslive",          desc: "crobuslive on Twitch" },
        kick:        { url: "https://kick.com/thecrobus",                desc: "thecrobus on Kick" },
        rumble:      { url: "https://rumble.com/user/Cobert0",           desc: "Cobert0 on Rumble" },
        soundcloud:  { url: "https://soundcloud.com/castafraymusic",     desc: "CASTAFRAY on SoundCloud" },
        spotify:     { url: "https://open.spotify.com/artist/4yJnKlxbqdWVdmIk4VvSsl", desc: "CASTAFRAY on Spotify" },
    };
    const ALIASES = { skeletons: "skeleton-variants", cleanup: "cleanup-utility", photography: "photos", kingdom: "crobus", castafray: "music", bj: "blackjack", "~": "home", "/": "home", "..": "home" };

    // What "ls" shows for each directory.
    const DIRS = {
        "~":      ["videos/", "music/", "software/", "games/", "photos/", "discord/", "contact/", "readme.txt"],
        software: ["apps/", "games/", "mods/", "github", "mcpedl", "curseforge"],
        apps:     ["visualizer", "dice", "rng", "coffee", "lethal", "villagerify"],
        games:    ["crobus", "blackjack"],
        mods:     ["minecraft-bedrock/"],
        "minecraft-bedrock": ["beverages.mcaddon", "skeleton-variants.mcaddon", "cleanup-utility.mcpack"],
        videos:   ["youtube", "thecrobus", "twitch", "kick", "rumble"],
        music:    ["soundcloud", "spotify"],
    };

    let cwd = "~";
    const history = [];
    let histIndex = 0;

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function print(html, cls) {
        const line = document.createElement("div");
        line.className = "term-line" + (cls ? " " + cls : "");
        line.innerHTML = html;
        out.appendChild(line);
        out.scrollTop = out.scrollHeight;
    }

    const prompt = () => `<span class="term-prompt">guest@cobertos:${esc(cwd)}$</span>`;

    function resolve(name) {
        if (!name) return null;
        const key = name.toLowerCase().replace(/\/+$/, "").replace(/\.(html|txt|mcaddon|mcpack)$/, "");
        const k = ALIASES[key] || key;
        return PLACES[k] ? k : null;
    }

    function go(key) {
        const p = PLACES[key];
        const external = /^https?:/.test(p.url);
        print(`Opening <span class="term-accent">${esc(key)}</span>${external ? " in a new tab" : ""}...`);
        setTimeout(() => {
            if (external) window.open(p.url, "_blank", "noopener");
            else window.location.href = p.url;
        }, 350);
    }

    const README = [
        "Hi, I'm Coby: programmer, content creator, gamer and tech enthusiast.",
        "I make music as CASTAFRAY, run Discord communities and Minecraft",
        "projects, and build little apps you can use in your browser.",
        "",
        "Try: <span class=\"term-accent\">ls</span>, <span class=\"term-accent\">open apps</span>, <span class=\"term-accent\">play blackjack</span>, <span class=\"term-accent\">roll 2d6</span>, <span class=\"term-accent\">socials</span>",
    ];

    const COMMANDS = {
        help: {
            desc: "List commands",
            run() {
                Object.entries(COMMANDS)
                    .filter(([, c]) => !c.hidden)
                    .forEach(([name, c]) => print(`<span class="term-accent">${name.padEnd(9).replace(/ /g, "&nbsp;")}</span> ${esc(c.desc)}`));
                print("Tip: Tab completes, ↑/↓ browses history.", "term-dim");
            },
        },
        ls: {
            desc: "List what's here (ls apps, ls mods...)",
            run(args) {
                let dir = (args[0] || cwd).toLowerCase().replace(/\/+$/, "");
                if (dir === "" || dir === "/" || dir === "home") dir = "~";
                if (dir === "photos") return print("Photos live in the gallery. Type <span class=\"term-accent\">open photos</span> to look.");
                if (["discord", "contact"].includes(dir)) return print(`Type <span class="term-accent">open ${dir}</span> to go there.`);
                const items = DIRS[dir];
                if (!items) return print(`ls: cannot access '${esc(dir)}': No such directory`, "term-err");
                print(items.map((i) => `<span class="${i.endsWith("/") ? "term-dir" : ""}">${esc(i)}</span>`).join("&nbsp;&nbsp;"));
            },
        },
        cd: {
            desc: "Change directory, or open a page",
            run(args) {
                const target = (args[0] || "~").toLowerCase().replace(/\/+$/, "");
                if (target === "~" || target === "" || target === ".." || target === "/") { cwd = "~"; return; }
                if (DIRS[target]) { cwd = target; return; }
                const key = resolve(target);
                if (key) return go(key);
                print(`cd: ${esc(target)}: No such directory`, "term-err");
            },
        },
        open: {
            desc: "Open a page or link (open music, open github...)",
            run(args) {
                if (!args[0]) return print("Usage: open &lt;name&gt;. Type <span class=\"term-accent\">ls</span> to see what's here.");
                const key = resolve(args[0]);
                if (key) return go(key);
                print(`open: '${esc(args[0])}' not found`, "term-err");
            },
        },
        cat: {
            desc: "Read a file (cat readme.txt)",
            run(args) {
                const f = (args[0] || "").toLowerCase();
                if (f === "readme.txt" || f === "readme") return README.forEach((l) => print(l || "&nbsp;"));
                if (/\.(mcaddon|mcpack)$/.test(f)) { const k = resolve(f); return print(`Binary file. Grab it on MCPEDL: <span class="term-accent">open ${k || "mcpedl"}</span>`); }
                print(`cat: ${esc(f || "(nothing)")}: No such file`, "term-err");
            },
        },
        about:   { desc: "Who is Coby?", run: () => README.slice(0, 3).forEach((l) => print(l)) },
        whoami:  { desc: "Who are you?", run: () => print("guest. Welcome to CobertOS.") },
        socials: {
            desc: "Where to find me",
            run() {
                ["youtube", "thecrobus", "twitch", "kick", "rumble", "soundcloud", "spotify", "github", "mcpedl", "curseforge"].forEach((k) =>
                    print(`<a class="term-link" href="${PLACES[k].url}" target="_blank" rel="noopener">${k.padEnd(11).replace(/ /g, "&nbsp;")}</a><span class="term-dim">${esc(PLACES[k].desc)}</span>`)
                );
            },
        },
        play: {
            desc: "Play a game (play blackjack)",
            run(args) {
                const key = resolve(args[0]);
                if (key === "blackjack" || key === "crobus") return go(key);
                print("Games: <span class=\"term-accent\">blackjack</span>, <span class=\"term-accent\">crobus</span>");
            },
        },
        roll: {
            desc: "Roll dice (roll, roll 2d6, roll d20)",
            run(args) {
                const m = (args[0] || "1d6").toLowerCase().match(/^(\d*)d(\d+)$/);
                if (!m) return print("Usage: roll [NdS], like 2d6 or d20", "term-err");
                const n = Math.min(parseInt(m[1] || "1", 10), 50);
                const sides = Math.min(parseInt(m[2], 10), 1000);
                if (n < 1 || sides < 2) return print("Need at least 1 die with 2 sides.", "term-err");
                const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
                const total = rolls.reduce((a, b) => a + b, 0);
                print(`🎲 ${rolls.join(" + ")}${n > 1 ? ` = <span class="term-accent">${total}</span>` : ""}`);
            },
        },
        rng: {
            desc: "Random number (rng 1 100)",
            run(args) {
                let [lo, hi] = args.map((a) => parseInt(a, 10));
                if (args.length === 0) { lo = 1; hi = 100; }
                if (!Number.isFinite(lo) || !Number.isFinite(hi)) return print("Usage: rng &lt;min&gt; &lt;max&gt;", "term-err");
                if (lo > hi) [lo, hi] = [hi, lo];
                print(`🔢 <span class="term-accent">${lo + Math.floor(Math.random() * (hi - lo + 1))}</span>`);
            },
        },
        neofetch: {
            desc: "System info",
            run() {
                const up = Math.floor(performance.now() / 1000);
                [
                    `<span class="term-accent">guest@cobertos</span>`,
                    "--------------",
                    "OS:       CobertOS",
                    "Host:     thecoberto.com",
                    `Uptime:   ${Math.floor(up / 60)}m ${up % 60}s`,
                    "Shell:    cobsh",
                    "Theme:    Purple Glow",
                    "Packages: 6 apps, 2 games, 3 mods",
                    "Music:    CASTAFRAY",
                ].forEach((l) => print(l.replace(/ {2,}/g, (s) => "&nbsp;".repeat(s.length))));
            },
        },
        date:    { desc: "Current date and time", run: () => print(esc(new Date().toString())) },
        echo:    { desc: "Print text", run: (args) => print(esc(args.join(" ")) || "&nbsp;") },
        history: { desc: "Command history", run: () => history.forEach((h, i) => print(`${String(i + 1).padStart(3).replace(/ /g, "&nbsp;")}&nbsp;&nbsp;${esc(h)}`)) },
        clear:   { desc: "Clear the screen", run: () => { out.innerHTML = ""; } },

        // Hidden extras
        sudo:  { hidden: true, run: () => print("guest is not in the sudoers file. This incident will be reported. 👀", "term-err") },
        rm:    { hidden: true, run: (args) => print(args.join(" ").includes("-rf") ? "Nice try. CobertOS is protected by the crown. 👑" : "rm: permission denied", "term-err") },
        exit:  { hidden: true, run: () => print("There is no exit from CobertOS. Only <span class=\"term-accent\">open</span>.") },
        hello: { hidden: true, run: () => print("Hey! 👋") },
        hi:    { hidden: true, run: () => print("Hey! 👋") },
        coffee: { hidden: true, run: () => go("coffee") },
        crobus: { hidden: true, run: () => print("👑 Long live the KINGDOM OF CROBUS. Type <span class=\"term-accent\">open crobus</span> or <span class=\"term-accent\">open map</span>.") },
        secret: {
            hidden: true,
            run() {
                print("You found a secret. 🕯️", "term-accent");
                document.body.classList.add("term-glitch");
                setTimeout(() => document.body.classList.remove("term-glitch"), 1200);
            },
        },
    };

    function run(raw) {
        const line = raw.trim();
        print(`${prompt()} ${esc(raw)}`);
        if (!line) return;
        history.push(line);
        histIndex = history.length;
        const [cmd, ...args] = line.split(/\s+/);
        const c = COMMANDS[cmd.toLowerCase()];
        if (c) return c.run(args);
        // Typing a page name on its own opens it.
        const key = resolve(cmd);
        if (key && args.length === 0) return go(key);
        print(`${esc(cmd)}: command not found. Type <span class="term-accent">help</span>.`, "term-err");
    }

    function complete() {
        const val = input.value;
        const parts = val.split(/\s+/);
        const word = parts[parts.length - 1].toLowerCase();
        const pool = parts.length === 1
            ? Object.keys(COMMANDS).filter((k) => !COMMANDS[k].hidden)
            : [...Object.keys(PLACES), ...Object.keys(DIRS), "readme.txt"];
        const matches = [...new Set(pool)].filter((k) => k.startsWith(word));
        if (matches.length === 1) {
            parts[parts.length - 1] = matches[0];
            input.value = parts.join(" ") + " ";
        } else if (matches.length > 1) {
            print(`${prompt()} ${esc(val)}`);
            print(matches.join("&nbsp;&nbsp;"), "term-dim");
        }
    }

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            run(input.value);
            input.value = "";
            document.getElementById("term-prompt-label").textContent = `guest@cobertos:${cwd}$`;
        } else if (e.key === "Tab") {
            e.preventDefault();
            complete();
        } else if (e.key === "ArrowUp") {
            if (histIndex > 0) { histIndex--; input.value = history[histIndex]; }
            e.preventDefault();
        } else if (e.key === "ArrowDown") {
            if (histIndex < history.length - 1) { histIndex++; input.value = history[histIndex]; }
            else { histIndex = history.length; input.value = ""; }
            e.preventDefault();
        } else if (e.key === "l" && e.ctrlKey) {
            e.preventDefault();
            out.innerHTML = "";
        }
    });

    // Clicking anywhere in the terminal focuses the input (unless selecting text or clicking a link).
    term.addEventListener("click", (e) => {
        if (e.target.closest("a") || window.getSelection().toString()) return;
        input.focus();
    });

    print("CobertOS terminal. Type <span class=\"term-accent\">help</span> to get started.", "term-dim");
})();
