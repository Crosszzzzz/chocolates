import * as THREE from 'three';
import { ChocolateFactory, ProductSpec } from '../types/chocolate';

export interface WrapperPiece {
  mesh: THREE.Mesh;
  initialPos: THREE.Vector3;
  initialRot: THREE.Euler;
  torn: boolean;
  dented: boolean;
  /** Accumulated pointer path length (px) spent crossing this piece. */
  pathAccum: number;
  velocity: THREE.Vector3;
  rotVelocity: THREE.Vector3;
  opacity: number;
}

export interface ShellDims {
  /** Full width along X (long axis). */
  width: number;
  /** Full height along Y. */
  height: number;
  /** Full depth along Z. */
  depth: number;
}

/** Branded canvas texture used for the outer wrapper shell pieces. */
export function createWrapperTexture(prod: ProductSpec, fac: ChocolateFactory): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const bgGrad = ctx.createLinearGradient(0, 0, 1024, 1024);
  bgGrad.addColorStop(0, prod.wrapperPrimaryColor);
  bgGrad.addColorStop(1, '#150804');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 18;
  ctx.strokeRect(36, 36, 952, 952);

  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 4;
  ctx.strokeRect(58, 58, 908, 908);

  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 44px "Cinzel", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(fac.name.toUpperCase(), 512, 160);

  ctx.fillStyle = '#e6d5c3';
  ctx.font = '24px sans-serif';
  ctx.fillText('SUCRE - BOLIVIA • DESDE ' + fac.foundationYear, 512, 210);

  ctx.beginPath();
  ctx.arc(512, 330, 80, 0, Math.PI * 2);
  ctx.fillStyle = '#d4af37';
  ctx.fill();
  ctx.fillStyle = '#1c100a';
  ctx.font = 'bold 36px "Cinzel", serif';
  ctx.fillText('CACAO', 512, 342);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px "Playfair Display", serif';
  ctx.fillText(prod.cacaoPercentage + '% CACAO', 512, 490);

  ctx.fillStyle = '#f1c40f';
  ctx.font = '36px "Playfair Display", serif';
  ctx.fillText(prod.name.length > 28 ? prod.name.slice(0, 28) + '...' : prod.name, 512, 560);

  ctx.fillStyle = '#e5c158';
  ctx.font = 'italic 28px sans-serif';
  ctx.fillText(prod.origin, 512, 630);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(`PESO NETO ${prod.weight}`, 512, 720);

  ctx.fillStyle = '#d4af37';
  ctx.fillRect(262, 780, 500, 4);
  ctx.font = '22px "Cinzel", serif';
  ctx.fillText('CALIDAD DE EXPORTACIÓN • PATRIMONIO DE SUCRE', 512, 830);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function makePiece(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: THREE.Vector3,
  rot: THREE.Euler,
  parent: THREE.Group
): WrapperPiece {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.rotation.copy(rot);
  mesh.castShadow = true;
  parent.add(mesh);
  return {
    mesh,
    initialPos: pos.clone(),
    initialRot: rot.clone(),
    torn: false,
    dented: false,
    pathAccum: 0,
    velocity: new THREE.Vector3(),
    rotVelocity: new THREE.Vector3(),
    opacity: 1
  };
}

/**
 * Build a tearable piece-shell sleeve around the given dimensions
 * (centered on the parent origin).
 *
 * Front face: 6x4 textured grid (the main interactive surface).
 * Back face: 3x2 textured grid. Sides: 4 solid gold-foil flaps.
 * Total = 34 pieces — enough for multi-stroke, piece-by-piece tearing.
 */
export function buildWrapperShell(
  parent: THREE.Group,
  dims: ShellDims,
  texture: THREE.Texture
): WrapperPiece[] {
  const pieces: WrapperPiece[] = [];
  const w = dims.width;
  const h = dims.height;
  const d = dims.depth;

  const frontCols = 6;
  const frontRows = 4;
  const pieceW = w / frontCols;
  const pieceH = h / frontRows;
  const zFront = d / 2 + 0.012;
  const zBack = -d / 2 - 0.012;

  const foilMat = new THREE.MeshStandardMaterial({
    color: 0xf1c40f,
    metalness: 0.92,
    roughness: 0.28,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1
  });

  // --- Front face: textured grid with UV sub-regions ---
  for (let r = 0; r < frontRows; r++) {
    for (let c = 0; c < frontCols; c++) {
      const x = (c - (frontCols - 1) / 2) * pieceW;
      const y = (r - (frontRows - 1) / 2) * pieceH;

      const geo = new THREE.PlaneGeometry(pieceW * 0.985, pieceH * 0.985);
      const uv = geo.attributes.uv;
      const uMin = c / frontCols;
      const uMax = (c + 1) / frontCols;
      const vMin = r / frontRows;
      const vMax = (r + 1) / frontRows;
      uv.setXY(0, uMin, vMax);
      uv.setXY(1, uMax, vMax);
      uv.setXY(2, uMin, vMin);
      uv.setXY(3, uMax, vMin);
      uv.needsUpdate = true;

      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.35,
        metalness: 0.4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1
      });

      pieces.push(
        makePiece(geo, mat, new THREE.Vector3(x, y, zFront), new THREE.Euler(0, 0, 0), parent)
      );
    }
  }

  // --- Back face: coarser textured grid (full design per piece reads fine) ---
  const backCols = 3;
  const backRows = 2;
  const bPieceW = w / backCols;
  const bPieceH = h / backRows;
  for (let r = 0; r < backRows; r++) {
    for (let c = 0; c < backCols; c++) {
      const x = (c - (backCols - 1) / 2) * bPieceW;
      const y = (r - (backRows - 1) / 2) * bPieceH;

      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.4,
        metalness: 0.35,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1
      });

      pieces.push(
        makePiece(
          new THREE.PlaneGeometry(bPieceW * 0.985, bPieceH * 0.985),
          mat,
          new THREE.Vector3(x, y, zBack),
          new THREE.Euler(0, Math.PI, 0),
          parent
        )
      );
    }
  }

  // --- Side flaps (gold foil): left, right, top, bottom ---
  const sideThick = Math.max(d, 0.05);
  pieces.push(
    makePiece(
      new THREE.PlaneGeometry(sideThick * 1.05, h * 0.985),
      foilMat.clone(),
      new THREE.Vector3(-w / 2 - 0.01, 0, 0),
      new THREE.Euler(0, -Math.PI / 2, 0),
      parent
    )
  );
  pieces.push(
    makePiece(
      new THREE.PlaneGeometry(sideThick * 1.05, h * 0.985),
      foilMat.clone(),
      new THREE.Vector3(w / 2 + 0.01, 0, 0),
      new THREE.Euler(0, Math.PI / 2, 0),
      parent
    )
  );
  pieces.push(
    makePiece(
      new THREE.PlaneGeometry(w * 0.985, sideThick * 1.05),
      foilMat.clone(),
      new THREE.Vector3(0, h / 2 + 0.01, 0),
      new THREE.Euler(-Math.PI / 2, 0, 0),
      parent
    )
  );
  pieces.push(
    makePiece(
      new THREE.PlaneGeometry(w * 0.985, sideThick * 1.05),
      foilMat.clone(),
      new THREE.Vector3(0, -h / 2 - 0.01, 0),
      new THREE.Euler(Math.PI / 2, 0, 0),
      parent
    )
  );

  return pieces;
}

/**
 * Launch a torn piece with random linear + angular velocity.
 * `scale` adapts linear velocity to the world size (AR uses meters).
 */
export function launchPiece(piece: WrapperPiece, scale = 1): void {
  piece.torn = true;
  piece.dented = false;
  piece.velocity.set(
    (Math.random() - 0.5) * 0.1 * scale,
    (-0.05 - Math.random() * 0.07) * scale,
    (0.06 + Math.random() * 0.1) * scale
  );
  piece.rotVelocity.set(
    (Math.random() - 0.5) * 0.22,
    (Math.random() - 0.5) * 0.22,
    (Math.random() - 0.5) * 0.22
  );
}

/** Reset every piece to its pristine wrapped state. */
export function resetPieces(pieces: WrapperPiece[]): void {
  for (const piece of pieces) {
    piece.torn = false;
    piece.dented = false;
    piece.pathAccum = 0;
    piece.opacity = 1;
    piece.mesh.visible = true;
    piece.mesh.position.copy(piece.initialPos);
    piece.mesh.rotation.copy(piece.initialRot);
    const mat = piece.mesh.material as THREE.MeshStandardMaterial;
    mat.opacity = 1;
  }
}

/** Smoothstep in JS (matches GLSL semantics). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

// --- Shared tear gesture tuning (unwrap view + AR) ---
/** Pointer path (px) required over a piece before it tears. */
export const TEAR_PATH_PX = 16;
/** Nudge threshold before a piece visibly "dents". */
export const DENT_PATH_PX = 4;
/** Max pieces a single pointer gesture may tear (one flick ≠ clean sweep). */
export const MAX_TEAR_PER_GESTURE = 3;
/** Min ms between foil tear sounds. */
export const TEAR_SOUND_THROTTLE = 140;

/**
 * Step torn-piece physics: gravity, spin, fade-out, then hide.
 * Returns nothing; mutates pieces in place.
 */
export function updatePiecePhysics(pieces: WrapperPiece[], gravity = 0.004): void {
  for (const piece of pieces) {
    if (piece.torn && piece.opacity > 0) {
      piece.velocity.y -= gravity;
      piece.mesh.position.add(piece.velocity);
      piece.mesh.rotation.x += piece.rotVelocity.x;
      piece.mesh.rotation.y += piece.rotVelocity.y;
      piece.mesh.rotation.z += piece.rotVelocity.z;
      piece.opacity = Math.max(0, piece.opacity - 0.02);
      (piece.mesh.material as THREE.MeshStandardMaterial).opacity = piece.opacity;
      if (piece.opacity <= 0) {
        piece.mesh.visible = false;
      }
    }
  }
}
