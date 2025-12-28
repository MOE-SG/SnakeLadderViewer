/**
 * script-viewer.js
 * ROLE: LIVE SPECTATOR (READ-ONLY)
 */

// --- 1. CONFIGURATION (Must match Player exactly) ---
const boardSize = 64;
const columns = 8;
const portals = { 
    2: 18, 10: 30, 25: 45, 42: 59, // Ladders
    22: 4, 37: 15, 50: 32, 62: 40  // Snakes
};

let players = []; 
let currentTurnIndex = 0;
let lastHeartbeat = Date.now();
// --- 2. PEERJS CONNECTION ---
// If port 443 is blocked, you can specify a custom port or use a different server
// PEERJS CONFIG: Host can change port here if 443 is blocked
const peer = new Peer(null, {
    host: '0.peerjs.com',
    port: 443, // Change this to 9000 or other if 443 is blocked
    secure: true
});
let hostConn = null;


// --- 1. INITIAL LOAD ---
window.onload = () => {
    // Retrieve the last room ID from browser memory
    const lastRoomId = localStorage.getItem('last_room_id');
    if (lastRoomId) {
        document.getElementById('host-id').value = lastRoomId;
        console.log("Last Room ID restored:", lastRoomId);
    }
};

// --- 2. STATUS UI HELPER ---
function updateConnectionStatus(isConnected) {
    const bar = document.getElementById('status-bar');
    const text = document.getElementById('status-text');
    const joinScreen = document.getElementById('join-screen');

    if (isConnected) {
        bar.className = 'status-connected';
        text.innerText = "Connected to Host";
        joinScreen.style.display = 'none'; // Hide input when connected
    } else {
        bar.className = 'status-disconnected';
        text.innerText = "Disconnected";
        joinScreen.style.display = 'block'; // Show input when disconnected
    }
}

function connectToPlayer() {
    const hostId = document.getElementById('host-id').value;
    if (!hostId) return alert("Please enter a Room ID");

	// added Save ID for next time
    localStorage.setItem('last_room_id', hostId);
    console.log("Connecting to:", hostId);
    hostConn = peer.connect(hostId);

    hostConn.on('open', () => {
        document.getElementById('join-screen').style.display = 'none';
		console.log("Connection Established!");
        updateConnectionStatus(true);
        init(); // Initialize board once connected
    });

    hostConn.on('data', (data) => {
		console.log("Received from Host:", data.type); // Check console to see if this triggers
		
		switch(data.type) {
			case 'SYNC':
			case 'UPDATE_STATE':
				players = data.players;
				currentTurnIndex = data.currentTurnIndex;
				
				// 1. Build the board tiles if they don't exist
				if (document.getElementById('board').children.length === 0) {
					init(); 
				}
				
				// 2. Update the tokens and leaderboard
				updateUI();
				
				// 3. Update viewer count
				if (data.viewerCount) {
					document.getElementById('viewer-count').innerText = data.viewerCount;
				}
				break;
				// Comprehensive update of the entire game state
			case 'ACTION_SOUND':
				const sound = document.getElementById(data.soundId);
				if (sound) { sound.currentTime = 0; sound.play().catch(e => {}); }
				break;

            case 'DICE_ROLL_RESULT':
                // Visual feedback for viewer
                document.getElementById('dice-result').innerText = `🎲 ${data.roll}`;
                const rollingPlayer = players.find(p => p.id === data.playerId);
                // The Host handles logic; we just update the UI
                break;

            case 'SYNC_POSITION':
                const p = players.find(p => p.id === data.playerId);
                if (p) p.pos = data.newPos;
                updateUI();
                break;

            case 'SHOW_MODAL':
                showViewerModal(data.title, data.text);
                break;

            case 'HIDE_MODAL':
                document.getElementById('event-modal').classList.add('hidden');
                break;

            case 'VIEWER_COUNT':
                document.getElementById('viewer-count').innerText = data.count;
                break;
                
            case 'FIREWORKS':
                launchFireworks();
                break;
			case 'STOP_FIREWORKS':
				// 1. Stop the sound
				const fwSound = document.getElementById('firework-sound');
				if (fwSound) {
					fwSound.pause();
					fwSound.currentTime = 0;
				}
				// 2. Hide the visual container
				const fwContainer = document.getElementById('fireworks-container');
				if (fwContainer) fwContainer.classList.add('hidden');
				break;
			case 'HEARTBEAT':
				lastHeartbeat = Date.now();
				break;
        }
    });
	
	hostConn.on('close', () => {
        console.warn("Connection Closed.");
        updateConnectionStatus(false);
    });
	hostConn.on('error', (err) => {
        console.error("Connection Error:", err);
        updateConnectionStatus(false);
    });

}

// --- 3. VISUAL ENGINE (Shared with Player) ---

function init() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    // Generate Board Tiles
    for (let r = columns - 1; r >= 0; r--) {
        const isEvenRow = r % 2 === 0;
        for (let c = 0; c < columns; c++) {
            const col = isEvenRow ? (columns - 1 - c) : c;
            const tileNum = r * columns + col + 1;
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.id = `tile-${tileNum}`;
            tile.innerText = tileNum;
            board.appendChild(tile);
        }
    }
    drawPortals();
    updateUI();
}

function updateUI() {
    // FIX: If players haven't loaded yet, exit the function early
    if (!players || players.length === 0) {
        console.log("Waiting for player data...");
        return; 
    }
	const active = players[currentTurnIndex];

	// Safety check for the active player specifically
    if (!active) return;
    const totalGlobalRolls = players.reduce((s, p) => s + p.rolls, 0);
    const indicator = document.getElementById('turn-indicator');
    //const rollBtn = document.getElementById('roll-btn');

    if (totalGlobalRolls === 0) {
        indicator.innerText = "ADMIN ENTRY REQUIRED";
        indicator.style.color = "#ef4444";
   //     rollBtn.disabled = true;  // viewer has no button
    } else if (active.rolls <= 0) {
        indicator.innerText = `${active.name} (Waiting...)`;
        indicator.style.color = "#64748b";
    //    rollBtn.disabled = true;
    } else {
        indicator.innerText = active.name;
        indicator.style.color = active.color;
    //    rollBtn.disabled = false;
    }

    document.getElementById('roll-counter').innerText = `Rolls: ${active.rolls}`;
    const tbody = document.getElementById('player-rows');
    tbody.innerHTML = '';

    players.forEach(p => {
        const isCurrent = p.id === active.id;
        const isFinished = p.finished;
        
        const row = document.createElement('tr');
        if (isCurrent) row.className = 'current-player-row';
        if (isFinished) row.classList.add('finished-player-row');
        
        row.innerHTML = `
            <td><span style="color:${p.color}">●</span> ${p.name} ${isFinished ? '🚩' : ''}</td>
            <td>${p.pos}</td>
            <td>${p.rolls}</td>
			<td>${p.totalRollsGiven || 0}</td> 
            <td>${p.escapes || 0}</td>
		`;
        
        tbody.appendChild(row);

        // AUTO-SCROLL LOGIC
        if (isCurrent) {
            // Wait for DOM to update then scroll
            setTimeout(() => {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }

       // 3. TOKEN LOGIC: Handling Tile 0 Staggering
        let t = document.getElementById(`token-${p.id}`);    
        if (!t) {
            t = document.createElement('div');
            t.id = `token-${p.id}`; t.className = 'token';
            t.style.background = p.color; t.innerText = p.id;
            document.getElementById('tokens-layer').appendChild(t);
        }

        let coords;
        if (p.pos === 0) {
            // Define "Waiting Area" to the right of the first tile
            const tile1 = getTileCenter(1);
            coords = { 
                x: tile1.x + 70, // Shift right of tile 1
                y: tile1.y 
            };
        } else {
            coords = getTileCenter(p.pos);
        }

        // Apply your staggered grid formula: (p.id % 5) * 4 for X and floor(p.id / 5) * 4 for Y
        t.style.left = (coords.x - 14 + (p.id % 5) * 4) + 'px';
        t.style.top = (coords.y - 14 + Math.floor(p.id / 5) * 4) + 'px';
        
        // Ensure tokens are visible if you previously had them hidden at pos 0
        t.style.display = 'flex';
        t.style.opacity = isFinished ? "0.4" : "1";
    });
}
function getTileCenter(index) {
    const tile = document.getElementById(`tile-${index}`);
    if (!tile) return { x: 0, y: 0 };
    return { x: tile.offsetLeft + 30, y: tile.offsetTop + 30 };
}

function getTilePoint(num, xOff = 0, yOff = 0) {
    const tile = document.getElementById(`tile-${num}`);
    if (!tile) return { x: 0, y: 0 };
    const centerX = tile.offsetLeft + (tile.offsetWidth / 2);
    const centerY = tile.offsetTop + (tile.offsetHeight / 2);
    return { x: centerX + xOff, y: centerY + yOff };
}

function drawPortals() {
    const svg = document.getElementById('svg-layer');
    // We must preserve the <defs> already in the HTML for the templates to work
    const defs = svg.querySelector('defs').outerHTML;
    svg.innerHTML = defs; 

   let i = 0;
    Object.entries(portals).forEach(([start, end]) => {
        start = parseInt(start);
        if (end < start) { // Draw Snakes
            const s = getTilePoint(start, 0, 0);
            const e = getTilePoint(end, 0, 0);
            const dx = e.x - s.x;
            const dy = e.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
            use.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#new-artwork-template");
            use.setAttribute("transform", `
                translate(${s.x}, ${s.y}) 
                rotate(${angle}) 
                scale(${dist / 300}, 1) 
                translate(-40, -40)
            `);
            svg.appendChild(use);
        } else { // Draw Ladders (Tigers)
             i = i +1;
			const tile = document.getElementById(`tile-${start}`);
            const hX = tile.offsetWidth / 2;
            const hY = tile.offsetHeight / 2;
			const s = getTilePoint(start, hX, hY); 
            const e = getTilePoint(end, hX, hY);
            const dx = e.x - s.x;
            const dy = e.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * (180 / Math.PI))+130;
			const flipThreshold = 40;
            const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
            use.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#tiger-template");
            const flip = Math.abs(angle) > flipThreshold ? -1 : 1;
			//const scale = dist/200;
			const baseHeight = 1000; 
			const scaleY = dist/baseHeight;
            console.log(`🪜 Ladder (${start} to ${end}): sx=${s.x}, sy=${s.y}, ex=${e.x}, ey=${e.y}, dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}, dist=${dist.toFixed(2)}, scaleY=${scaleY.toFixed(2)}, angle = ${angle.toFixed(2)}`);
			//const scaleX = dist / baseHeight;
			if (i==1){
			use.setAttribute("transform", `
				translate(480, 420)
				scale(0.25,0.2)
				rotate(30)	
            `);
			}else if (i==2){
			use.setAttribute("transform", `
				translate(${e.x-10}, ${e.y-10})
				rotate(50)	
				scale(-0.2,0.52)
            `);
			}else if (i==3){
			use.setAttribute("transform", `
				translate(${e.x-20}, ${e.y-10})
				rotate(50)	
				scale(-0.2,0.52)
            `);
			}else if (i==4){
			use.setAttribute("transform", `
				translate(${e.x-10}, ${e.y-30})
				rotate(0)	
				scale(-0.25,0.25)
            `);}
			svg.appendChild(use);
        }
    });
}

// --- 4. VIEWER EXCLUSIVES ---

function showViewerModal(title, text) {
    const m = document.getElementById('event-modal');
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-text').innerText = text;
    m.classList.remove('hidden');
    // NOTE: No confirm button for viewers! Host controls closure.
}

function launchFireworks() {
    const container = document.getElementById('fireworks-container');
    container.classList.remove('hidden');
    container.innerHTML = '';
    for (let i = 0; i < 15; i++) {
        const fw = document.createElement('div');
        fw.className = 'firework';
        fw.style.setProperty('--x', (Math.random() * 80 + 10) + 'vw');
        fw.style.setProperty('--y', (Math.random() * 50 + 10) + 'vh');
        fw.style.setProperty('--color', `hsl(${Math.random() * 360}, 100%, 60%)`);
        fw.style.animationDelay = (Math.random() * 2) + 's';
        container.appendChild(fw);
    }
}

// Every 5 seconds, check if the host is "stale"
setInterval(() => {
    // If the host is already marked as disconnected, don't keep warning
    const statusText = document.getElementById('status-text').innerText;
    if (statusText === "Disconnected") return;

    const timeSinceLastUpdate = Date.now() - lastHeartbeat;
    
    // If no word for 7 seconds, assume the host is gone
    if (timeSinceLastUpdate > 7000) { 
        console.warn("Host is unresponsive (Silent for 7s)");
        updateConnectionStatus(false); 
        
        // Optional: Attempt to auto-reconnect if you have the ID saved
        // connectToPlayer(); 
    }
}, 5000);
