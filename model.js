const CONFIG_EQUIPOS = {
  LEFT: {
    modelo: 'assets/l5_alien.vrm',
    sprite: 'assets/alien_green.png', // Imagen ligera para móviles
    escala: '1 1 1',
    alturaTexto: 2.3,
    colorTexto: '#166534',
    colorMarcador: '#4ade80',
    rotacionJugador: '0 70 0'
  },
  RIGHT: {
    modelo: 'assets/grey_alien.vrm',
    sprite: 'assets/alien_gris.png', // Imagen ligera para móviles
    escala: '1 1 1',
    alturaTexto: 2.3,
    colorTexto: '#334155',
    colorMarcador: '#cbd5e1',
    rotacionJugador: '0 -70 0'
  }
};

const playerEntities = new Map();
const isMobile = AFRAME.utils.device.isMobile();

function initScene() {
  console.log(`Motor de renderizado: ${isMobile ? 'MÓVIL (2D Sprites)' : 'DESKTOP (3D VRM)'}`);
}

function truncateName(name, limit = 12) {
  if (!name) return "Anonimo";
  return name.length > limit ? name.substring(0, limit) + "..." : name;
}

function renderScene(activePlayers, currentPlayer) {
  const container = document.getElementById('arena-jugadores');
  if (!container) return;

  const currentIds = new Set(activePlayers.map(p => p.id));

  for (const [id, entity] of playerEntities.entries()) {
    if (!currentIds.has(id)) {
      container.removeChild(entity);
      playerEntities.delete(id);
    }
  }

  let countLeft = 0;
  let countRight = 0;

  activePlayers.forEach((player) => {
    const side = player.side;
    if (side !== 'LEFT' && side !== 'RIGHT') return;

    const conf = CONFIG_EQUIPOS[side];
    let posX;

    if (side === 'LEFT') {
      posX = -1.5 - (countLeft * 1.3);
      countLeft++;
    } else {
      posX = 1.5 + (countRight * 1.3);
      countRight++;
    }

    let grupoEl = playerEntities.get(player.id);

    if (!grupoEl) {
      grupoEl = document.createElement('a-entity');
      
      const jugadorEl = document.createElement('a-entity');
      jugadorEl.classList.add('vrm-body');

      if (isMobile) {
          // MODO MÓVIL: Plano 2D optimizado
          jugadorEl.setAttribute('geometry', 'primitive: plane; width: 1.6; height: 2.2');
          jugadorEl.setAttribute('material', {
              src: conf.sprite,
              transparent: true,
              shader: 'flat',
              side: 'double'
          });
          // Posicionar un poco arriba para que no lo tape el anillo
          jugadorEl.setAttribute('position', '0 1.1 0');
          // Orientación fija hacia la cámara
          jugadorEl.setAttribute('rotation', '0 0 0'); 
      } else {
          // MODO DESKTOP: Modelo 3D Completo
          jugadorEl.setAttribute('vrm-model', conf.modelo);
          jugadorEl.setAttribute('scale', conf.escala);
          jugadorEl.setAttribute('rotation', conf.rotacionJugador);
          jugadorEl.setAttribute('agarrar-cuerda', `lado: ${side === 'LEFT' ? 'izquierda' : 'derecha'}`);
      }

      // EVIDENCIA AR MARKER: Disco de base (en ambos modos)
      const marcadorBase = document.createElement('a-ring');
      marcadorBase.setAttribute('radius-inner', '0.4');
      marcadorBase.setAttribute('radius-outer', '0.6');
      marcadorBase.setAttribute('rotation', '-90 0 0');
      marcadorBase.setAttribute('position', '0 0.02 0');
      marcadorBase.setAttribute('material', {
          color: conf.colorMarcador,
          transparent: true,
          opacity: 0.6,
          shader: 'flat'
      });
      marcadorBase.classList.add('marker-disc');
      
      marcadorBase.setAttribute('animation__pulse', {
          property: 'scale',
          from: '1 1 1',
          to: '1.1 1.1 1.1',
          dur: 1500,
          dir: 'alternate',
          loop: true,
          easing: 'easeInOutSine'
      });

      const textoEl = document.createElement('a-text');
      textoEl.setAttribute('position', `0 ${conf.alturaTexto} 0`);
      textoEl.setAttribute('align', 'center');
      textoEl.setAttribute('width', '4');
      textoEl.classList.add('player-label');

      grupoEl.appendChild(marcadorBase);
      grupoEl.appendChild(jugadorEl);
      grupoEl.appendChild(textoEl);
      container.appendChild(grupoEl);
      playerEntities.set(player.id, grupoEl);
    }

    grupoEl.setAttribute('position', `${posX} 0 -4.65`);
    
    const textoEl = grupoEl.querySelector('.player-label');
    const displayAlias = truncateName(player.alias);
    const isLocal = currentPlayer && player.id === currentPlayer.id;
    
    textoEl.setAttribute('value', isLocal ? `> ${displayAlias} <` : displayAlias);
    textoEl.setAttribute('color', conf.colorTexto);
    if (isLocal) textoEl.setAttribute('font-weight', 'bold');

    const jugadorEl = grupoEl.querySelector('.vrm-body');
    
    if (isMobile) {
        // Actualizar sprite si cambia de equipo
        const currentSrc = jugadorEl.getAttribute('material').src;
        if (currentSrc !== conf.sprite) {
            jugadorEl.setAttribute('material', 'src', conf.sprite);
            const disco = grupoEl.querySelector('.marker-disc');
            if (disco) disco.setAttribute('color', conf.colorMarcador);
        }
    } else {
        // Actualizar modelo 3D si cambia de equipo
        const currentModel = jugadorEl.getAttribute('vrm-model');
        const targetLado = `lado: ${side === 'LEFT' ? 'izquierda' : 'derecha'}`;
        const currentLado = jugadorEl.getAttribute('agarrar-cuerda');

        if (currentModel !== conf.modelo || currentLado !== targetLado) {
            jugadorEl.setAttribute('vrm-model', conf.modelo);
            jugadorEl.setAttribute('agarrar-cuerda', targetLado);
            jugadorEl.setAttribute('rotation', conf.rotacionJugador);
            const disco = grupoEl.querySelector('.marker-disc');
            if (disco) disco.setAttribute('color', conf.colorMarcador);
        }
    }
  });

  actualizarCuerda3D(countLeft, countRight);
  actualizarHUDCounts(countLeft, countRight);
}

function actualizarCuerda3D(countLeft, countRight) {
  const sistemaCuerda = document.getElementById('sistema-cuerda');
  const arenaJugadores = document.getElementById('arena-jugadores');
  const nuevaPosX = (countRight - countLeft) * 0.02;
  
  if (sistemaCuerda) {
    sistemaCuerda.setAttribute('animation__pos',
      `property: position; to: ${nuevaPosX} 1 -5; dur: 300; easing: easeOutQuad`);
  }
  if (arenaJugadores) {
    arenaJugadores.setAttribute('animation__pos',
      `property: position; to: ${nuevaPosX} 0 0; dur: 300; easing: easeOutQuad`);
  }
}

function actualizarHUDCounts(left, right) {
  const domLeft = document.getElementById('leftCount');
  const domRight = document.getElementById('rightCount');
  const domDiff = document.getElementById('differenceCount');
  if (domLeft) domLeft.textContent = left;
  if (domRight) domRight.textContent = right;
  if (domDiff) domDiff.textContent = Math.abs(left - right);
}

function renderPlayerStateUI(currentPlayer) {
  const side = currentPlayer?.side || "Sin elegir";
  const currentSideDom = document.getElementById('currentSide');
  if (currentSideDom) {
    currentSideDom.textContent = side === 'LEFT' ? 'VERDE' : (side === 'RIGHT' ? 'GRIS' : 'Sin elegir');
  }
}

let localOffset = 0;
function applyLocalMove(offset) {
    localOffset += offset;
    updateRopeTransform();
}

function syncRopeWithPulls(leftTotal, rightTotal) {
    const basePosX = (rightTotal - leftTotal) * 0.02;
    const sistemaCuerda = document.getElementById('sistema-cuerda');
    const arenaJugadores = document.getElementById('arena-jugadores');
    if (sistemaCuerda) {
        sistemaCuerda.setAttribute('animation__pos', `property: position; to: ${basePosX} 1 -5; dur: 300; easing: easeOutQuad`);
    }
    if (arenaJugadores) {
        arenaJugadores.setAttribute('animation__pos', `property: position; to: ${basePosX} 0 0; dur: 300; easing: easeOutQuad`);
    }
    localOffset = 0;
}

function updateRopeTransform() {
    const sistemaCuerda = document.getElementById('sistema-cuerda');
    if (!sistemaCuerda) return;
    const currentPos = sistemaCuerda.getAttribute('position');
    sistemaCuerda.setAttribute('position', { x: currentPos.x + localOffset, y: currentPos.y, z: currentPos.z });
    localOffset = 0;
}

function animateMarker() {
    const marcador = document.getElementById('contenedor-marcador');
    if (marcador) {
        marcador.setAttribute('animation__float', { property: 'position', from: '0 4.8 -5', to: '0 5.0 -5', dir: 'alternate', dur: 3000, loop: true, easing: 'easeInOutSine' });
        marcador.setAttribute('animation__tilt', { property: 'rotation', from: '-1 0 0', to: '1 0 0', dir: 'alternate', dur: 4500, loop: true, easing: 'easeInOutSine' });
    }
}

function animatePull(playerId) {
    const entity = playerEntities.get(playerId);
    if (!entity) return;
    const label = entity.querySelector('.player-label');
    if (label) {
        label.setAttribute('animation__pull', { property: 'scale', from: '1 1 1', to: '1.2 1.2 1.2', dur: 100, dir: 'alternate', loop: 2, easing: 'easeOutQuad' });
    }
}

setTimeout(animateMarker, 2000);
