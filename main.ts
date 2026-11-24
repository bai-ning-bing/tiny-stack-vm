// Tiny stack VM for make.fun tiny-stack-vm-01-run-20261122: a faithful port of
// the kit's reference VM (program/generator/subject/vm.mjs), the rule where
// ISA.md could be read two ways.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Opcode table: byte -> [immediate bytes, pops, pushes].
const E: [number, number, number][] = [];
for (const [o, i, p, u] of [
  [0, 0, 0, 0], [1, 1, 0, 1], [2, 4, 0, 1], [3, 0, 1, 0], [4, 0, 1, 2],
  [5, 0, 2, 2], [6, 0, 2, 3], [7, 0, 3, 3],
  [16, 0, 2, 1], [17, 0, 2, 1], [18, 0, 2, 1], [19, 0, 2, 1], [20, 0, 2, 1],
  [21, 0, 2, 1], [22, 0, 2, 1], [23, 0, 1, 1], [24, 0, 2, 1], [25, 0, 2, 1],
  [26, 0, 2, 1], [27, 0, 1, 1], [28, 0, 2, 1], [29, 0, 2, 1], [30, 0, 2, 1],
  [32, 0, 2, 1], [33, 0, 2, 1], [34, 0, 2, 1],
  [48, 2, 0, 0], [49, 2, 1, 0], [50, 2, 1, 0], [51, 2, 0, 0], [52, 0, 0, 0],
  [64, 0, 1, 1], [65, 0, 2, 0],
  [80, 0, 1, 0], [81, 0, 1, 0], [82, 0, 0, 1], [83, 0, 1, 0],
]) E[o] = [i, p, u];

// Opcode bytes (ISA.md "The opcodes").
const OP = {HALT:0,PUSH8:1,PUSH32:2,POP:3,DUP:4,SWAP:5,OVER:6,ROT:7,ADD:16,SUB:17,
  MUL:18,DIV:19,MOD:20,DIVU:21,MODU:22,NEG:23,AND:24,OR:25,XOR:26,NOT:27,SHL:28,
  SHR:29,SHRU:30,EQ:32,LT:33,LTU:34,JMP:48,JZ:49,JNZ:50,CALL:51,RET:52,LOAD:64,
  STORE:65,PRINT:80,PUTC:81,IN:82,EXIT:83};

// Trap codes (ISA.md "Traps"): the exit code of a program that traps.
const TRAP_UNDERFLOW = 2, TRAP_OVERFLOW = 3, TRAP_DIV_ZERO = 4, TRAP_BAD_OPCODE = 5;
const TRAP_MEMORY = 6, TRAP_CALL_DEPTH = 7, TRAP_RET_EMPTY = 8, TRAP_PC = 9;
const TRAP_STEPS = 10, TRAP_OUTPUT = 11;

function run(p: Uint8Array, inp: Uint8Array): { o: Uint8Array; c: number } {
  const n = p.length;
  const D = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let cp = 0;
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, st = 0;
  const end = (c: number): { o: Uint8Array; c: number } => ({ o: out.slice(0, ol), c });
  for (;;) {
    if (st === 1e6) return end(TRAP_STEPS);
    if (pc < 0 || pc >= n) return end(TRAP_PC);
    const op = p[pc];
    const e = E[op];
    if (!e) return end(TRAP_BAD_OPCODE);
    const [im, po, pu] = e;
    if (pc + im >= n) return end(TRAP_PC);
    st++;
    const nx = pc + 1 + im;
    if (sp < po) return end(TRAP_UNDERFLOW);
    if (sp - po + pu > 256) return end(TRAP_OVERFLOW);
    pc = nx;
    switch (op) {
      case OP.HALT: return end(0);
      case OP.PUSH8: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case OP.PUSH32: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case OP.POP: sp--; break;
      case OP.DUP: D[sp] = D[sp - 1]; sp++; break;
      case OP.SWAP: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case OP.OVER: D[sp] = D[sp - 2]; sp++; break;
      case OP.ROT: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case OP.NEG: D[sp - 1] = (-D[sp - 1]) | 0; break;
      case OP.NOT: D[sp - 1] = ~D[sp - 1]; break;
      case OP.ADD: case OP.SUB: case OP.MUL: case OP.DIV: case OP.MOD: case OP.DIVU: case OP.MODU:
      case OP.AND: case OP.OR: case OP.XOR: case OP.SHL: case OP.SHR: case OP.SHRU: case OP.EQ: case OP.LT: case OP.LTU: {
        const b = D[sp - 1], a = D[sp - 2];
        let r: number;
        if (op === OP.ADD) r = (a + b) | 0;
        else if (op === OP.SUB) r = (a - b) | 0;
        else if (op === OP.MUL) r = Math.imul(a, b);
        else if (op === OP.DIV) {
          if (b === 0) return end(TRAP_DIV_ZERO);
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (op === OP.MOD) {
          if (b === 0) return end(TRAP_DIV_ZERO);
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (op === OP.DIVU) {
          if (b === 0) return end(TRAP_DIV_ZERO);
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === OP.MODU) {
          if (b === 0) return end(TRAP_DIV_ZERO);
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === OP.AND) r = a & b;
        else if (op === OP.OR) r = a | b;
        else if (op === OP.XOR) r = a ^ b;
        else if (op === OP.SHL) r = a << (b & 31);
        else if (op === OP.SHR) r = a >> (b & 31);
        else if (op === OP.SHRU) r = (a >>> (b & 31)) | 0;
        else if (op === OP.EQ) r = a === b ? 1 : 0;
        else if (op === OP.LT) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2;
        D[sp++] = r;
        break;
      }
      case OP.JMP: case OP.JZ: case OP.JNZ: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== OP.JMP) {
          const v = D[--sp];
          take = op === OP.JZ ? v === 0 : v !== 0;
        }
        if (take) pc = nx + rel;
        break;
      }
      case OP.CALL:
        if (cp === 64) return end(TRAP_CALL_DEPTH);
        C[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case OP.RET:
        if (cp === 0) return end(TRAP_RET_EMPTY);
        pc = C[--cp];
        break;
      case OP.LOAD: {
        const a = D[sp - 1];
        if (a < 0 || a >= 256) return end(TRAP_MEMORY);
        D[sp - 1] = M[a];
        break;
      }
      case OP.STORE: {
        const a = D[sp - 1], v = D[sp - 2];
        if (a < 0 || a >= 256) return end(TRAP_MEMORY);
        sp -= 2;
        M[a] = v;
        break;
      }
      case OP.PRINT: {
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return end(TRAP_OUTPUT);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case OP.PUTC:
        if (ol + 1 > 65536) return end(TRAP_OUTPUT);
        out[ol++] = D[--sp] & 255;
        break;
      case OP.IN:
        D[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      case OP.EXIT:
        return end(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(
    new Uint8Array(readFileSync(join(I, id, 'program.bin'))),
    new Uint8Array(readFileSync(join(I, id, 'input.bin'))),
  );
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.o);
  writeFileSync(join(O, id, 'exit.txt'), `${r.c}\n`);
}
