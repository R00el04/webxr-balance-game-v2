const SUPABASE_URL = "https://hvwbwlidzpktwlsnngtb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d2J3bGlkenBrdHdsc25uZ3RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjQxMzgsImV4cCI6MjA5NDgwMDEzOH0.O4AT3LX3vjaucao858G0_795V_ZUd31vdiJGUqOBCt4";
const HEARTBEAT_INTERVAL_MS = 5000;
const PRESENCE_TIMEOUT_MS = 15000;
const SNAPSHOT_REFRESH_MS = 5000;
const MAX_BAR_OFFSET_PX = 150;
const MAX_BAR_ROTATION_DEG = 18;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const state = {
  authMode: "login",
  session: null,
  currentPlayer: null,
  activePlayers: [],
  isAuthBusy: false,
  isSideBusy: false,
  heartbeatTimerId: null,
  refreshTimerId: null,
  authBootstrapVersion: 0
};

const dom = {
  authPanel: document.getElementById("authPanel"),
  authForm: document.getElementById("authForm"),
  loginTab: document.getElementById("loginTab"),
  registerTab: document.getElementById("registerTab"),
  aliasInput: document.getElementById("aliasInput"),
  passwordInput: document.getElementById("passwordInput"),
  authSubmitBtn: document.getElementById("authSubmitBtn"),
  authFeedback: document.getElementById("authFeedback"),
  gameUI: document.getElementById("gameUI"),
  logoutBtn: document.getElementById("logoutBtn"),
  leftBtn: document.getElementById("leftBtn"),
  rightBtn: document.getElementById("rightBtn"),
  leftCountText: document.getElementById("leftCount"),
  rightCountText: document.getElementById("rightCount"),
  differenceCountText: document.getElementById("differenceCount"),
  currentSideText: document.getElementById("currentSide"),
  tiltStateText: document.getElementById("tiltState"),
  tiltOffsetText: document.getElementById("tiltOffset"),
  playerAliasLabel: document.getElementById("playerAliasLabel"),
  playerInfo: document.getElementById("playerInfo"),
  sessionIndicator: document.getElementById("sessionIndicator"),
  sessionStatusText: document.getElementById("sessionStatusText"),
  statusBanner: document.getElementById("statusBanner"),
  balanceRig: document.getElementById("balanceRig"),
  leftAvatarLane: document.getElementById("leftAvatarLane"),
  rightAvatarLane: document.getElementById("rightAvatarLane"),
  leftSceneCount: document.getElementById("leftSceneCount"),
  rightSceneCount: document.getElementById("rightSceneCount"),
  sceneTiltLabel: document.getElementById("sceneTiltLabel")
};

bindUI();
initApp().catch(handleUnexpectedError);

function bindUI() {
  dom.authForm.addEventListener("submit", handleAuthSubmit);
  dom.loginTab.addEventListener("click", () => setAuthMode("login"));
  dom.registerTab.addEventListener("click", () => setAuthMode("register"));
  dom.leftBtn.addEventListener("click", () => chooseSide("LEFT"));
  dom.rightBtn.addEventListener("click", () => chooseSide("RIGHT"));
  dom.logoutBtn.addEventListener("click", handleLogout);

  window.addEventListener("pagehide", flushPresenceOnExit);
  window.addEventListener("beforeunload", flushPresenceOnExit);
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

async function initApp() {
  setAuthMode("login");
  renderGameState([]);
  toggleGameUI(false);
  setStatus("Inicializando sesion...", "info");
  setFeedback("Usa un alias unico y una contrasena de al menos 6 caracteres.");

  subscribeToPlayersRealtime();

  db.auth.onAuthStateChange((_event, session) => {
    handleSessionChange(session).catch(handleUnexpectedError);
  });

  const {
    data: { session }
  } = await db.auth.getSession();

  await handleSessionChange(session);
}

async function handleSessionChange(session) {
  state.authBootstrapVersion += 1;
  const version = state.authBootstrapVersion;
  state.session = session;

  stopPresenceLoops();

  if (!session) {
    state.currentPlayer = null;
    state.activePlayers = [];
    renderSignedOutState();
    return;
  }

  setAuthBusy(true);
  setStatus("Recuperando perfil del jugador...", "info");
  setSessionState("idle", "Restaurando sesion...");

  try {
    await ensurePlayerProfile(session.user);

    if (version !== state.authBootstrapVersion) {
      return;
    }

    await markPresenceActive();
    startPresenceLoops();
    await loadGameState();

    if (version !== state.authBootstrapVersion) {
      return;
    }

    toggleGameUI(true);
    setFeedback("");
    setSessionState("live", "Sesion activa");
    setStatus(`Sesion activa como ${state.currentPlayer.alias}.`, "success");
  } catch (error) {
    console.error(error);
    setStatus("No se pudo restaurar la sesion del juego.", "error");
    setFeedback(error.message || "Error al recuperar la sesion.");
  } finally {
    if (version === state.authBootstrapVersion) {
      setAuthBusy(false);
      syncAuthButtonLabel();
      renderPlayerState();
    }
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  if (state.isAuthBusy) {
    return;
  }

  const alias = sanitizeAlias(dom.aliasInput.value);
  const password = dom.passwordInput.value.trim();

  const validationError = validateCredentials(alias, password);
  if (validationError) {
    setStatus(validationError, "warning");
    setFeedback(validationError);
    return;
  }

  const syntheticEmail = buildSyntheticEmail(alias);

  setAuthBusy(true);
  setFeedback("");
  setStatus(
    state.authMode === "register" ? "Creando cuenta..." : "Iniciando sesion...",
    "info"
  );

  try {
    if (state.authMode === "register") {
      const { data, error } = await db.auth.signUp({
        email: syntheticEmail,
        password,
        options: {
          data: {
            alias
          }
        }
      });

      if (error) {
        throw error;
      }

      if (!data.session) {
        throw new Error("Desactiva la confirmacion por correo en Supabase Auth para esta demo.");
      }

      setStatus(`Cuenta creada para ${alias}.`, "success");
    } else {
      const { error } = await db.auth.signInWithPassword({
        email: syntheticEmail,
        password
      });

      if (error) {
        throw error;
      }

      setStatus(`Sesion iniciada para ${alias}.`, "success");
    }
  } catch (error) {
    console.error(error);
    setStatus(mapAuthError(error), "error");
    setFeedback(mapAuthError(error));
    setAuthBusy(false);
  }
}

async function handleLogout() {
  if (!state.session || state.isAuthBusy) {
    return;
  }

  setAuthBusy(true);
  setStatus("Cerrando sesion...", "info");

  try {
    await markPresenceInactive();
  } catch (error) {
    console.error(error);
  }

  const { error } = await db.auth.signOut();
  if (error) {
    console.error(error);
    setStatus("No se pudo cerrar la sesion correctamente.", "error");
  }

  setAuthBusy(false);
}

async function ensurePlayerProfile(user) {
  const aliasFromMetadata = sanitizeAlias(user.user_metadata?.alias || "");
  const currentPlayer = await fetchCurrentPlayer(user.id);

  if (currentPlayer) {
    state.currentPlayer = currentPlayer;
    return;
  }

  const alias = aliasFromMetadata || extractAliasFromEmail(user.email);

  const { error } = await db.from("players").insert({
    id: user.id,
    alias,
    side: null,
    is_active: false,
    last_seen_at: new Date().toISOString()
  });

  if (error) {
    throw error;
  }

  state.currentPlayer = await fetchCurrentPlayer(user.id);
}

async function fetchCurrentPlayer(userId = state.session?.user?.id) {
  if (!userId) {
    return null;
  }

  const { data, error } = await db
    .from("players")
    .select("id, alias, side, is_active, last_seen_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function chooseSide(side) {
  if (!state.currentPlayer || state.isSideBusy) {
    return;
  }

  setSideBusy(true);
  setStatus(`Actualizando tu posicion a ${side}...`, "info");

  try {
    const { error } = await db
      .from("players")
      .update({
        side,
        is_active: true,
        last_seen_at: new Date().toISOString()
      })
      .eq("id", state.currentPlayer.id);

    if (error) {
      throw error;
    }

    state.currentPlayer.side = side;
    renderPlayerState();
    await loadGameState();
    setStatus(`Ahora estas en ${side}.`, "success");
  } catch (error) {
    console.error(error);
    setStatus("No se pudo cambiar tu lado.", "error");
  } finally {
    setSideBusy(false);
  }
}

async function loadGameState() {
  if (!state.session) {
    state.activePlayers = [];
    renderGameState([]);
    return;
  }

  const [players, currentPlayer] = await Promise.all([
    fetchActivePlayers(),
    fetchCurrentPlayer()
  ]);

  state.activePlayers = players;
  state.currentPlayer = currentPlayer || state.currentPlayer;
  renderGameState(players);
  renderPlayerState();
}

async function fetchActivePlayers() {
  const { data, error } = await db
    .from("active_players")
    .select("id, alias, side, last_seen_at")
    .order("alias", { ascending: true });

  if (!error) {
    return data || [];
  }

  console.warn("Fallo la vista active_players. Se usara el filtro directo.", error);

  const thresholdIso = new Date(Date.now() - PRESENCE_TIMEOUT_MS).toISOString();
  const fallback = await db
    .from("players")
    .select("id, alias, side, last_seen_at")
    .eq("is_active", true)
    .gt("last_seen_at", thresholdIso)
    .order("alias", { ascending: true });

  if (fallback.error) {
    throw fallback.error;
  }

  return fallback.data || [];
}

async function markPresenceActive() {
  if (!state.currentPlayer) {
    return;
  }

  const { error } = await db
    .from("players")
    .update({
      is_active: true,
      last_seen_at: new Date().toISOString()
    })
    .eq("id", state.currentPlayer.id);

  if (error) {
    throw error;
  }
}

async function markPresenceInactive() {
  if (!state.currentPlayer) {
    return;
  }

  const { error } = await db
    .from("players")
    .update({
      is_active: false,
      last_seen_at: new Date().toISOString()
    })
    .eq("id", state.currentPlayer.id);

  if (error) {
    throw error;
  }
}

function startPresenceLoops() {
  stopPresenceLoops();

  state.heartbeatTimerId = window.setInterval(() => {
    markPresenceActive().catch(handleUnexpectedError);
  }, HEARTBEAT_INTERVAL_MS);

  state.refreshTimerId = window.setInterval(() => {
    loadGameState().catch(handleUnexpectedError);
  }, SNAPSHOT_REFRESH_MS);
}

function stopPresenceLoops() {
  if (state.heartbeatTimerId) {
    window.clearInterval(state.heartbeatTimerId);
    state.heartbeatTimerId = null;
  }

  if (state.refreshTimerId) {
    window.clearInterval(state.refreshTimerId);
    state.refreshTimerId = null;
  }
}

function subscribeToPlayersRealtime() {
  db.channel("players-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players"
      },
      () => {
        if (state.session) {
          loadGameState().catch(handleUnexpectedError);
        }
      }
    )
    .subscribe();
}

function flushPresenceOnExit() {
  if (!state.session || !state.currentPlayer) {
    return;
  }

  const payload = JSON.stringify({
    is_active: false,
    last_seen_at: new Date().toISOString()
  });

  fetch(
    `${SUPABASE_URL}/rest/v1/players?id=eq.${encodeURIComponent(state.currentPlayer.id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${state.session.access_token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: payload,
      keepalive: true
    }
  ).catch(() => {
    // Si el navegador cancela este fetch, el timeout de presencia limpiara el marcador.
  });
}

function handleVisibilityChange() {
  if (!state.session) {
    return;
  }

  if (!document.hidden) {
    markPresenceActive().catch(handleUnexpectedError);
    loadGameState().catch(handleUnexpectedError);
  }
}

function renderSignedOutState() {
  toggleGameUI(false);
  renderGameState([]);
  dom.playerAliasLabel.textContent = "Jugador";
  dom.playerInfo.textContent = "Inicia sesion para entrar al balance.";
  dom.currentSideText.textContent = "Sin elegir";
  dom.aliasInput.value = "";
  dom.passwordInput.value = "";
  setSessionState("idle", "Sin sesion");
  setFeedback("Usa tu alias registrado para volver a entrar.");
  setStatus("Inicia sesion o registrate para jugar.", "info");
  setAuthBusy(false);
  setSideBusy(false);
}

function renderGameState(players) {
  const leftPlayers = players.filter((player) => player.side === "LEFT");
  const rightPlayers = players.filter((player) => player.side === "RIGHT");
  const leftCount = leftPlayers.length;
  const rightCount = rightPlayers.length;
  const difference = leftCount - rightCount;
  const offsetPx = clamp(-difference * 25, -MAX_BAR_OFFSET_PX, MAX_BAR_OFFSET_PX);
  const offsetMeters = offsetPx / 100;
  const rotationZ = clamp(difference * 3, -MAX_BAR_ROTATION_DEG, MAX_BAR_ROTATION_DEG);
  const tiltLabel = buildTiltLabel(difference);

  dom.leftCountText.textContent = String(leftCount);
  dom.rightCountText.textContent = String(rightCount);
  dom.differenceCountText.textContent = String(Math.abs(difference));
  dom.tiltStateText.textContent = tiltLabel;
  dom.tiltOffsetText.textContent = `Desplazamiento ${Math.abs(offsetPx)} px`;
  dom.leftSceneCount.setAttribute("value", String(leftCount));
  dom.rightSceneCount.setAttribute("value", String(rightCount));
  dom.sceneTiltLabel.setAttribute("value", tiltLabel);

  // 🚨 [MODIFICADO] Aquí bajamos la posición de la cuerda de 2.7 a 1.16 metros en el eje Y
  dom.balanceRig.setAttribute("position", `${offsetMeters} 1.16 -4`);
  dom.balanceRig.setAttribute("rotation", `0 0 ${rotationZ}`);
  
  renderPlayerAvatars(leftPlayers, rightPlayers);
}

function renderPlayerState() {
  const alias = state.currentPlayer?.alias || "Jugador";
  const side = state.currentPlayer?.side || "Sin elegir";

  dom.playerAliasLabel.textContent = alias;
  dom.currentSideText.textContent = side;
  dom.leftBtn.dataset.active = String(side === "LEFT");
  dom.rightBtn.dataset.active = String(side === "RIGHT");
  dom.playerInfo.textContent = state.currentPlayer
    ? `Tu presencia se renueva cada ${HEARTBEAT_INTERVAL_MS / 1000}s y expira tras ${
        PRESENCE_TIMEOUT_MS / 1000
      }s sin actividad.`
    : "Inicia sesion para entrar al balance.";
}

function toggleGameUI(isVisible) {
  dom.authPanel.classList.toggle("hidden", isVisible);
  dom.gameUI.classList.toggle("hidden", !isVisible);
}

function setAuthMode(mode) {
  state.authMode = mode;
  dom.loginTab.classList.toggle("active", mode === "login");
  dom.registerTab.classList.toggle("active", mode === "register");
  dom.passwordInput.autocomplete = mode === "register" ? "new-password" : "current-password";
  syncAuthButtonLabel();
}

function syncAuthButtonLabel() {
  if (state.isAuthBusy) {
    dom.authSubmitBtn.textContent = state.authMode === "register" ? "Creando cuenta..." : "Ingresando...";
    return;
  }

  dom.authSubmitBtn.textContent = state.authMode === "register" ? "Crear cuenta" : "Entrar al juego";
}

function setAuthBusy(isBusy) {
  state.isAuthBusy = isBusy;
  dom.aliasInput.disabled = isBusy;
  dom.passwordInput.disabled = isBusy;
  dom.authSubmitBtn.disabled = isBusy;
  dom.loginTab.disabled = isBusy;
  dom.registerTab.disabled = isBusy;
  dom.logoutBtn.disabled = isBusy;
  dom.leftBtn.disabled = isBusy || state.isSideBusy || !state.currentPlayer;
  dom.rightBtn.disabled = isBusy || state.isSideBusy || !state.currentPlayer;
  syncAuthButtonLabel();
}

function setSideBusy(isBusy) {
  state.isSideBusy = isBusy;
  dom.leftBtn.disabled = isBusy || state.isAuthBusy || !state.currentPlayer;
  dom.rightBtn.disabled = isBusy || state.isAuthBusy || !state.currentPlayer;
}

function setFeedback(message) {
  dom.authFeedback.textContent = message;
}

function setStatus(message, tone) {
  dom.statusBanner.textContent = message;
  dom.statusBanner.className = `status-banner status-${tone}`;
}

function setSessionState(mode, text) {
  dom.sessionStatusText.textContent = text;
  dom.sessionIndicator.className = "session-dot";

  if (mode === "live") {
    dom.sessionIndicator.classList.add("live");
  } else if (mode === "idle") {
    dom.sessionIndicator.classList.add("idle");
  }
}

function sanitizeAlias(rawAlias) {
  return rawAlias.trim().replace(/\s+/g, " ");
}

function validateCredentials(alias, password) {
  if (!alias) {
    return "Ingresa un alias.";
  }

  if (!/^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ _-]{3,18}$/.test(alias)) {
    return "El alias debe tener 3-18 caracteres y solo usar letras, numeros, espacios, _ o -.";
  }

  if (password.length < 6) {
    return "La contrasena debe tener al menos 6 caracteres.";
  }

  return "";
}

function buildSyntheticEmail(alias) {
  const aliasSlug = alias
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");

  if (!aliasSlug) {
    throw new Error("No se pudo construir un alias valido para la autenticacion.");
  }

  return `${aliasSlug}@game.local`;
}

function extractAliasFromEmail(email) {
  return (email || "Jugador").split("@")[0];
}

function buildTiltLabel(difference) {
  if (difference === 0) {
    return "Centrado";
  }

  return difference > 0 ? "Inclinacion hacia LEFT" : "Inclinacion hacia RIGHT";
}

function renderPlayerAvatars(leftPlayers, rightPlayers) {
  clearEntityChildren(dom.leftAvatarLane);
  clearEntityChildren(dom.rightAvatarLane);

  leftPlayers.forEach((player, index) => {
    dom.leftAvatarLane.appendChild(createAvatarEntity(player, index, "LEFT"));
  });

  rightPlayers.forEach((player, index) => {
    dom.rightAvatarLane.appendChild(createAvatarEntity(player, index, "RIGHT"));
  });
}

function createAvatarEntity(player, index, side) {
  const avatar = document.createElement("a-entity");
  const isCurrentPlayer = player.id === state.currentPlayer?.id;
  
  // Posicionamiento: alejados del centro
  const startOffset = 0.7; // Desplazamiento inicial para no estar pegados al centro
  const spacingX = 1.1;    // Más espacio entre jugadores
  const laneX = startOffset + (index * spacingX); 
  const laneZ = 0;
  
  // Estética mejorada
  const accentColor = side === "LEFT" ? "#3498db" : "#2ecc71";
  const torsoColor = isCurrentPlayer ? "#f1c40f" : accentColor;
  const headColor = isCurrentPlayer ? "#ffeaa7" : "#f5cba7";
  const textColor = isCurrentPlayer ? "#f1c40f" : "#ffffff";
  
  // Rotación de "Tirando": Inclinación hacia afuera para simular fuerza
  const baseRotationY = side === "LEFT" ? 25 : -25;
  const leanZ = side === "LEFT" ? 15 : -15; // Inclinación hacia atrás/afuera

  const relativeX = side === "LEFT" ? -laneX : laneX;

  avatar.setAttribute("position", `${relativeX} 0 ${laneZ}`);
  // Inclinamos todo el avatar hacia atrás para que parezca que hace fuerza
  avatar.setAttribute("rotation", `0 ${baseRotationY} ${leanZ}`);

  // Animación de jalar: balanceo de fuerza
  const pullDist = side === "LEFT" ? -0.15 : 0.15;
  avatar.setAttribute("animation", `property: position; from: ${relativeX} 0 ${laneZ}; to: ${relativeX + pullDist} 0 ${laneZ}; dir: alternate; loop: true; dur: 300; easing: easeInOutSine`);

  // --- CUERPO DETALLADO ---

  // Pelo / Sombrero
  avatar.appendChild(createPrimitive("a-sphere", {
    position: "0 1.65 0",
    radius: "0.25",
    color: "#2c3e50",
    scale: "1.1 0.6 1"
  }));

  // Cabeza
  avatar.appendChild(createPrimitive("a-sphere", {
    position: "0 1.48 0",
    radius: "0.23",
    color: headColor
  }));

  // Ojos (expresión de esfuerzo)
  avatar.appendChild(createPrimitive("a-sphere", {
    position: "-0.08 1.52 0.18",
    radius: "0.03",
    color: "black"
  }));
  avatar.appendChild(createPrimitive("a-sphere", {
    position: "0.08 1.52 0.18",
    radius: "0.03",
    color: "black"
  }));

  // Torso (más robusto)
  avatar.appendChild(createPrimitive("a-box", {
    position: "0 0.85 0",
    width: "0.5",
    height: "0.7",
    depth: "0.3",
    color: torsoColor,
    radius: "0.05"
  }));

  // Brazos (en posición de sujetar la cuerda)
  const armAngle = side === "LEFT" ? -45 : 45;
  const armX = side === "LEFT" ? 0.3 : -0.3;
  
  // Brazo exterior
  avatar.appendChild(createPrimitive("a-cylinder", {
    position: `${armX} 0.9 0.1`,
    radius: "0.06",
    height: "0.6",
    rotation: `90 ${armAngle} 0`,
    color: headColor
  }));

  // Brazo interior
  avatar.appendChild(createPrimitive("a-cylinder", {
    position: `${-armX * 0.5} 0.9 0.15`,
    radius: "0.06",
    height: "0.5",
    rotation: `90 ${-armAngle} 0`,
    color: headColor
  }));

  // Piernas (posición de apoyo firme)
  avatar.appendChild(createPrimitive("a-cylinder", {
    position: "-0.15 0.25 0",
    radius: "0.08",
    height: "0.7",
    rotation: "0 0 15",
    color: "#2c3e50"
  }));
  avatar.appendChild(createPrimitive("a-cylinder", {
    position: "0.15 0.25 0",
    radius: "0.08",
    height: "0.7",
    rotation: "0 0 -15",
    color: "#2c3e50"
  }));

  // Pies/Zapatos
  avatar.appendChild(createPrimitive("a-box", {
    position: "-0.18 -0.05 0.1",
    width: "0.2",
    height: "0.1",
    depth: "0.3",
    color: "#1a1a1a"
  }));
  avatar.appendChild(createPrimitive("a-box", {
    position: "0.18 -0.05 0.1",
    width: "0.2",
    height: "0.1",
    depth: "0.3",
    color: "#1a1a1a"
  }));

  // Nombre
  avatar.appendChild(createPrimitive("a-text", {
    value: player.alias,
    position: "0 2.1 0",
    align: "center",
    color: textColor,
    width: 4
  }));

  return avatar;
}

function createPrimitive(tagName, attributes) {
  const element = document.createElement(tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });
  return element;
}

function clearEntityChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function mapAuthError(error) {
  const message = error?.message || "No se pudo completar la autenticacion.";
  if (message.includes("Invalid login credentials")) {
    return "Alias o contrasena incorrectos.";
  }
  if (message.includes("User already registered")) {
    return "Ese alias ya esta registrado.";
  }
  if (message.includes("Password should be at least")) {
    return "La contrasena debe tener al menos 6 caracteres.";
  }
  return message;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function handleUnexpectedError(error) {
  console.error(error);
  setStatus("Ocurrio un error inesperado en el cliente.", "error");
}