JSX, a Javascript Playstation Emulator
======================================

JSX is a Playstation emulator written in Javascript. The goal of this project is
to test the limit of modern Javascript engines and new technologies like WebGL
by throwing at them a problem that developers traditionally solved with lower-
level languages, like C++, C or even assembly.

Why the Playstation?
--------------------

Out of the first consoles with 3D capabilities, the Playstation is by far the
simplest. The Nintendo 64 sports three coprocessors that act in parallel, two of
which with seemingly overlapping tasks and with instructions sets that are still
obscure to the emulation community. Also, as its name implies, the N64 has a 64
bits CPU, making it a lot harder to implement in Javascript, since the language
doesn't have 64-bit integers. It also has real virtual memory, obfuscated boot
sequences, a floating-point unit, and all kinds of cool things that make it a
more powerful console--but definitely not an easier-to-emulate console.

On the other hand, the Playstation has a very simple CPU, no virtual memory, no
FPU, just one active processor and just a handful of connected devices. This
makes it a much more convenient platform to emulate, especially under the tight
constraints of Javascript.

Hardware and Memory
--------------------

JSX has been written with some modularity in mind. Global variables are avoided
like plague and disparate components are connected through the `Playstation`
class. The `Memory` class implements the memory map, and special devices can
wire themselves through the `HardwareRegisters` class.

CPU
---

The CPU core dynamically translates MIPS R3000a machine code into JS, leveraging
most modern engines' ability to compile JS into native code. While most of the
core instruction set has been implemented, instructions from the [Geometry
Transformation Engine][1] are notably missing.

The MIPS R3000a has two instruction families to modify the execution flow:
branches (opcodes starting in __b__) and jumps (opcodes starting in __j__).
Branches are possibly-conditional, small jumps that are performed inside the
same subroutine. Jumps will usually go to a far place, start a new subroutine
(with `jal`, jump-and-link), or go to a variable location. The two are handled
differently by the code generator.

Since Javascript doesn't exactly have `goto` statements, labels for branches are
implemented using a `switch` statement inside a loop. Each time a branch is
taken, the `pc` variable is modified and execution is returned at the beginning
of the loop. The `switch` then targets a different location based on said `pc`
variable.

Jumps, on the other hand, cause the generated function to return the next
execution address. This gracefully handles indirect jumps, since we cannot
determine their address at recompile-time. We simply have to return the value of
a register.

Since the PSX has only 2 MB or RAM, games will often swap in and out executable
code. Because of that constraint, a `FunctionCache` class connected to the code
generator and to the `Memory` class keeps track of the generated functions, and
when a memory write is performed, it will invalidate all functions in the 256
bytes range it belongs to.

Running JSX
-----------

To run JSX, you will need to obtain a Playstation BIOS first. As this file is
copyrighted by Sony, its distribution is illegal and you will need to [dump your
Playstation][2] to obtain it.

Currently, JSX is able to execute some of the BIOS code and gets stuck when it
would need the GPU to actually do something.


 [1]: http://psx.rules.org/gte.txt
 [2]: http://forums.ngemu.com/showthread.php?t=93161