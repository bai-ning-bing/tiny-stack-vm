# tiny-stack-vm

A faithful interpreter for make.fun's tiny stack ISA (version 1), written for
the tiny-stack-vm-01-run-20261122 bounty. `main.ts` runs every program in a
set: it reads `/input/<id>/program.bin` and `input.bin`, and writes
`/output/<id>/stdout.bin` and `exit.txt`.

It implements the full ISA from the kit's `ISA.md`, following the reference VM
(`vm.mjs`) where the two could be read differently: exact 32-bit wrapping
(`Math.imul` for MUL), unsigned DIVU/MODU/LTU, the INT_MIN edge cases, and all
traps 2–11 with their exact exit codes, keeping output written before a trap.
