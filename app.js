const SUPABASE_URL = "https://hvwbwlidzpktwlsnngtb.supabase.co";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d2J3bGlkenBrdHdsc25uZ3RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjQxMzgsImV4cCI6MjA5NDgwMDEzOH0.O4AT3LX3vjaucao858G0_795V_ZUd31vdiJGUqOBCt4";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentPlayerId = localStorage.getItem("player_id");
let currentAlias = localStorage.getItem("player_alias");

const loginPanel = document.getElementById("loginPanel");
const gameUI = document.getElementById("gameUI");
const aliasInput = document.getElementById("aliasInput");
const joinBtn = document.getElementById("joinBtn");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");

const leftCountText = document.getElementById("leftCount");
const rightCountText = document.getElementById("rightCount");
const tiltStateText = document.getElementById("tiltState");
const playerInfo = document.getElementById("playerInfo");
const balanceBar = document.getElementById("balanceBar");

joinBtn.addEventListener("click", joinGame);
leftBtn.addEventListener("click", () => chooseSide("LEFT"));
rightBtn.addEventListener("click", () => chooseSide("RIGHT"));

async function joinGame() {
  const alias = aliasInput.value.trim();

  if (!alias) {
    alert("Ingresa un alias.");
    return;
  }

  const { data, error } = await db
    .from("players")
    .insert({
      alias: alias,
      side: null,
      online: true
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    alert("Error al ingresar al juego.");
    return;
  }

  currentPlayerId = data.id;
  currentAlias = data.alias;

  localStorage.setItem("player_id", currentPlayerId);
  localStorage.setItem("player_alias", currentAlias);

  showGame();
  loadPlayers();
}

function showGame() {
  loginPanel.classList.add("hidden");
  gameUI.classList.remove("hidden");
  playerInfo.textContent = `Jugador: ${currentAlias}`;
}

async function chooseSide(side) {
  if (!currentPlayerId) {
    alert("Primero ingresa al juego.");
    return;
  }

  const { error } = await db
    .from("players")
    .update({
      side: side,
      online: true,
      updated_at: new Date().toISOString()
    })
    .eq("id", currentPlayerId);

  if (error) {
    console.error(error);
    alert("Error al cambiar de lado.");
  }
}

async function loadPlayers() {
  const { data, error } = await db
    .from("players")
    .select("*")
    .eq("online", true);

  if (error) {
    console.error(error);
    return;
  }

  updateGame(data);
}

function updateGame(players) {
  const leftPlayers = players.filter(p => p.side === "LEFT").length;
  const rightPlayers = players.filter(p => p.side === "RIGHT").length;

  leftCountText.textContent = leftPlayers;
  rightCountText.textContent = rightPlayers;

  const difference = rightPlayers - leftPlayers;

  let positionX = difference * 25;
  let rotationZ = difference * -8;

  positionX = Math.max(-150, Math.min(150, positionX));
  rotationZ = Math.max(-35, Math.min(35, rotationZ));

  balanceBar.setAttribute("position", `${positionX / 100} 1.4 -3`);
  balanceBar.setAttribute("rotation", `0 0 ${rotationZ}`);

  if (difference === 0) {
    tiltStateText.textContent = "Centrado";
  } else if (difference < 0) {
    tiltStateText.textContent = "Inclinación hacia LEFT";
  } else {
    tiltStateText.textContent = "Inclinación hacia RIGHT";
  }
}

db
  .channel("players-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "players"
    },
    () => {
      loadPlayers();
    }
  )
  .subscribe();

window.addEventListener("beforeunload", async () => {
  if (currentPlayerId) {
    await db
      .from("players")
      .update({
        online: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentPlayerId);
  }
});

async function restoreSession() {
  if (currentPlayerId && currentAlias) {
    await db
      .from("players")
      .update({
        online: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentPlayerId);

    showGame();
    loadPlayers();
  }
}

restoreSession();