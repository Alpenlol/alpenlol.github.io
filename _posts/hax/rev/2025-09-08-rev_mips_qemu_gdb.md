---
layout: post
title: Reverse Engineering MIPS Binaries with QEMU and GDB Multi-arch
subtitle: Extracting router firmware and using QEMU with GDB Multi-arch
tags: rev gdb mips qemu 
date: 2025-09-08
background: https://lh3.googleusercontent.com/d/1B384OyOyFyCODK8sLAnbTR06NO7sDQli
---

# Architecture and Memory Constraints 
Hunting for vulnerabilities and crafting exploits in low-powered MIPS devices such as routers and other IoT faces a few challenges. One being MIPS (Microprocessor without Interlocked Pipelined Stages) itself. MIPS is a Reduced Instruction Set Computer (RISC) architecture that doesn't play nicely when observed from Intel x86 or ARM (lol Apple), which most of us are using in our attack boxes. MIPS, and being low powered devices, often implies lightweight resources in general. Memory (RAM) is another major constraint when investigating these devices. As attackers, we are often deploying tools and such to instrument onboard MIPS devices. Low memory constraints have often inhibited the instrumentation process during investigations. 

# Instrumenting for Dynamic Analysis
A common workflow when investigating a device, and narrowing the scope to a specific process involves attaching a debugger to said process. [GDB](https://en.wikipedia.org/wiki/GNU_Debugger) (GNU Debugger) is often the tool of choice to debug during a dynamic analysis session. GDB is, for very good reason, not installed on routers or IoT devices by default. As attackers the choice move is to get a MIPS statically compiled binary of `gdb-server`, then port it onto our victim device by means of conventional hax file transfers (raw TCP with netcat). `gdb-server` is then attached to our process of interest, listening on a local port. From an attacking machine, it is commong to use `gdb-multiarch`, and specifying the `target remote <IP:PORT>` directive. 

A common pitfall to this strategy, as hinted previously, is that these victim devices are already clapped-out on memory. Suddenly running `gdb-server` then attaching an probing remote debugging session will hinder performance, if not totally kill `SIGSEGV` (or equivalent) the debugging session. 

# Let's Take the Debug Process and Push it Somewhere Else

![](https://lh3.googleusercontent.com/d/1XN6dmjV6qqFOxEMzEGQTfZULomXzupot)

Memory and architecture got you down? Simply emulate the target process. 

## Emulating Reality with QEMU
"Kee-Moo", "Q-em-you"? Doesn't matter, Emus are a cool bird so I pronounce it "Kee-Moo". What does matter is that we can use [QEMU](https://www.qemu.org/) to emulate the environment needed for our target process, allowing us to run everything onboard our attacking machine (assuming the attacking machine isn't choked out on RAM either). 

Assuming we are all playing on the same Linux machine (Debian 13 here), we need to get QEMU: 
```
$ sudo apt install qemu-system qemu-user-static
```
If that doesn't work, some other dependencies are missing. That is an excercise left to the reader. 

Figure out where `qemu-mips-static` is hiding, we'll wan't a copy of the binary ported into our chroot jail later:

```
$ which qemu-mips-static
/usr/bin/qemu-mips-static
```

Cool, make note of that. 

## Finding a Target Process
Next up, we're going to beat up the `conn-indicator` binary again. No groundbreaking vulns will be found in the writeup. It's just fresh in mind from a previous writeup: [https://hyvasec.net/2025/08/23/bindiff-archer_ax50.html](https://hyvasec.net/2025/08/23/bindiff-archer_ax50.html). 

Sing along to grab some firmware, unpack it, and set up our environment. 
```
# Download
$ wget https://static.tp-link.com/upload/firmware/2024/202402/20240201/Archer%20AX50_V1_240108.zip

# Unzip 
$ unzip Archer\ AX50_V1_240108.zip

# Rename
$ mv ax50v1_intel-up-ver1-0-14-P1\[20240108-rel42655\]_sign_2024-01-08_14.05.44.bin AX50_1-0-14.bin

# Extract firmware image
# Install Binwalk before this ;) 
$ binwalk -e AX50_1-0-14.bin

# change dir to target root
$ cd _AX50_1-0-14.bin.extracted/squashfs-root
```

Our target process lives at `/usr/sbin/conn-indicator` (remove first `/` for relative dir). 

## Launch QEMU with Debug Port

We have extracted our firmware and located our target, now we can run our emulation. We will chroot the extracted firmware's root directory and run `qemu-mips-static` here. First we need that copy of `qemu-mips-static` in our jail: 
```
$ cp `which qemu-mips-static` . # JK you didn't need to remember that path 
```
Now we emulate:
```
$ sudo chroot . ./qemu-mips-static -g 6969 usr/sbin/conn-indicator
```
`-g 6969` is the port for debugging. Number doesn't matter, but `6969` is VERY easy to remember. 

Don't expect any output from this command, or much activity from this at all except for some possible `STDERR` messages later. 

Now we attach `gdb-multiarch` from another terminal session. Make sure the new terminal session is also current-directoried at `squashfs-root`:

```
$ cd $PATH_TO_FIRMWARE/squashfs-root
$ gdb-multiarch usr/sbin/conn-indicator
...
...
(gdb) set sysroot . # helps link resources
(gdb) target remote localhost:6969 # See, easy to remember! 
Remote debugging using localhost:6969
Reading symbols from ./lib/ld-uClibc.so.0...
(No debugging symbols found in ./lib/ld-uClibc.so.0)
0x2b2b0f40 in ?? ()
(gdb)
```
We're in!! Things run a little differently in this session, but a persistent user can figure it out. Quick dissassembly: 
```
(gdb) info functions
0x00401f08 _init
0x00401f50 main
0x00402410 __start
...
...
(gdb) x/32i 0x00401f50
=> 0x401f50:    addiu    sp,sp,-72
   0x401f54:    move     a2,zero
   0x401f5c:    sw       s0,32(sp)
   0x401f60:    lui      s0,0x42
...
```

# Conclusion
Hack the planet! (one MIPS binary at a time)