---
layout: post
title: AI Assisted Security Research on the Barracuda ESG - Recon, Fuzzing, and Exploitation
subtitle: How we leveraged offensive security AI to automate fuzz testing against an enterprise email appliance
tags: hax barracuda fuzzing ai pwn
date: 2025-12-14
background: https://lh3.googleusercontent.com/d/1yXfE2xyf_iwSUQiRg33LO9pybE1lPPro 
---

# Barracuda ESG Research - The Continuation

If you've been following along, you might remember my [previous writeup on CVE-2023-2868](/2025/08/20/cve-2023-2868-deep-dive.html), where we crafted one of the first public proof of concepts for command injection in Barracuda's Email Security Gateway. 

Since then, we've taken the research much deeper - combining autonomous AI-driven analysis with traditional fuzzing and manual code review. The results? A handful of findings to (human) validate further. AI analysis is great at setting up test pipelines, triggering faults, and reconnaisance. Exploitability testing and development still requires significant human operator intervention. 

# The Target: Barracuda ESG 300

Our target:
- **Device:** Barracuda ESG 300
- **Firmware:** 9.4.0.014 (yeah we updated to a newer version)
- **Kernel:** Linux 4.9.17-barracuda0  (Linux kernel 4.9.17, lolwut?)
- **Architecture:** x86_64 / i386

# Attack Surface Mapping

## Network Services - What's Listening?

A quick enumeration revealed 6 exposed network services:

| Port | Service | Notes |
|------|---------|-------|
| 443 | nginx + FastCGI | Primary web interface - big target |
| 80 | Apache/nginx | HTTP redirect |
| 22 | sshd | ssh, locked down to support by default |
| 25 | artful_dice + bsmtpd | Custom SMTP daemons |
| 161/UDP | snmpd | Monitoring |
| 3306 | MySQL | Backend DB (localhost only, but accessible from web services) |

# What We're Fuzzing

## artful_dice - Mystery Binary

This 18MB Go binary is the largest in the firmware. Statically linked, stripped, and its exact purpose wasn't immediately clear from static analysis. It handles SMTP traffic, so we threw AFL++ at it.

Current status: 7.7M+ executions at ~281 execs/sec. Zero crashes so far. Either the Go code is surprisingly robust, or we need to rethink our approach to trigger the interesting code paths. The investigation continues.

## bsmtpd - Real Target

Now THIS is what we're excited about. bsmtpd is the custom Barracuda SMTP daemon:
- **Size:** 1.2 MB ELF 32-bit (i386)
- **Has:** DEBUG SYMBOLS (makes crash analysis beautiful)
- **Features:** Lua-based module system with 50+ modules, TLS/SSL, ClamAV integration, RBL, SPF, archive extraction

Debug symbols + custom code + complex protocol handling = high vulnerability probability.

Our fuzzing setup for bsmtpd:
```
bsmtpd_fuzz/
├── input/                         # Attack-specific seed inputs
│   ├── attack_template_injection_sender.txt
│   ├── attack_template_injection_domain.txt
│   ├── attack_redos_subject.txt
│   ├── attack_archive_zipbomb.txt
│   ├── attack_archive_nested.txt
│   ├── attack_archive_traversal.txt
│   └── attack_archive_longname.txt
├── config/
│   ├── minimal.conf              # Lightweight for fuzzing
│   └── maximum.conf              # All 50+ modules enabled
└── intelligent_fuzzer.py         # Custom harness
```

# How We're Fuzzing

## AFL++ Configuration

We're running AFL++ in multiple configurations:

```bash
# Dumb mode for stripped Go binaries
afl-fuzz -n -i input/ -o output_dumb/ -m 8000 -- ./artful_dice @@

# Instrumented mode for debug binaries
afl-fuzz -i input/ -o output/ -- ./bsmtpd -c config/minimal.conf @@
```

For bsmtpd, we built a network harness using [preeny](https://github.com/zardus/preeny) for socket-to-stdin conversion. This lets AFL++ fuzz the live daemon without needing network I/O.

## Attack-Specific Payloads

We're not just throwing random bytes. Our seed corpus includes targeted attack payloads. These serve as basic examples, many more are used in practice:

**Template Injection:**
```
' .. os.execute('id') .. '@evil.com
```

**Archive Extraction Attacks:**
- Zip bombs: 1.4 MB → 1 GB expansion (100x ratio)
- Nested archives: 10 levels deep for stack exhaustion
- Path traversal: `../../../etc/passwd`
- Long filenames: 10,000 characters for buffer overflow tests

**ReDoS (Regular Expression DoS):**
```
(a+)+b
(a|a)*
(a*)*
```
These target select lua module regex compilation.

## Monitoring Infrastructure

We built a dashboard to monitor fuzzing campaigns. It tracks:
- Executions per second
- Queue size
- Crash count
- Hang count
- Coverage metrics

Along with AFL, a custom grammar fuzzer tailored to bsmtpd was created as well. bsmtpd fuzzer generates 666 (nice!) test cases based on our attack templates and runs continuously.

# AI-Assisted Research - The Force Multiplier

Here's where things get interesting. We've been using the [RAPTOR](https://github.com/gadievron/raptor) Autonomous Offensive/Defensive Security Framework to accelerate our research.

## What RAPTOR Does

RAPTOR conducts autonomous vulnerability scanning across the entire firmware. Point it at a directory, it analyzes everything - binaries, scripts, configs, web apps. Output comes in SARIF format for tool integration plus human-readable markdown.

Example scan results:
```
Web Directory Scan: 141.7 seconds
├── 263 files analyzed
├── 239 findings
│   ├── 212 XSS (unquoted attributes)
│   ├── 21 injection vectors
│   ├── 5 direct script injections
│   └── 1 protocol downgrade

Perl Modules Scan: 5.2 seconds
├── 46 modules analyzed
└── 17 host header injection findings
```

In under 3 minutes, RAPTOR identified 256+ vulnerabilities across 300+ files. The amount of findings is impressive but obviously has the usual false positives, as many of these results are from [CodeQL](https://codeql.github.com/) and [semgrep](https://github.com/semgrep/semgrep).

## Where AI Shines

1. **Recon:** AI finds attack surface very quickly. This is often busy work and is done quickly with AI automation. Surface area is quickly mapped to backend functionality.  
2. **Test harness creation:**  Claude was very quick to create grammar-based fuzzers in python. This is a fun use case for AI, as there's plenty room for errors and non-determinism.
3. **Documentation:** Auto-generating SARIF reports, attack trees, exploitation scenarios. 

## Where Human Analysis Still Wins
Errors and hallucination are still very common even with premier models. Human supervision is still required for a lot of tasks beyond basic scripting, automation, and test case generation. Determining exploitability and exploit development still requires a lot of creative reasoning that AI do not handle well. 

AI is great at finding the puzzle pieces, but humans still need to assemble the damn thing. 

## The Hybrid Approach

High level workflow:
1. **Targeting** - Human selects initial target. We like firmware so we attack firmware. 
2. **Extraction** - AI does a great job at unpacking and emulating firmware!
3. **RAPTOR sweep** - Autonomous scanning of all code, configs, binaries. This grabs the low hanging fruit. 
4. **Triage** - Human review of high/critical findings.
5. **Recon** - AI instructed to map all surface area (ports, applications, modules, i.e. public attack surface). Maps it to backend functionality as well. 
6. **Manual deep dive** - Tracing interesting paths the AI flagged.
7. **Fuzzing** - AI instructed to launch AFL and custom grammer fuzzer against high priority attack surface. Emphasis on test case generation that maximizes test coverage. 
8. **Exploitation** - Human building PoCs for confirmed vulns. AI is alright at selecting gadgets but does not piece the picture together well. 

This combination has made us significantly more effective. Claude x RAPTOR handles the grunt work. We focus on the creative exploitation.

# What's Next

We're continuing to fuzz bsmtpd and the other custom binaries. A few faults triggered by the fuzzer confirms our approach. The entire pipeline for this project was created within a few hours; faults triggered within a few days of fuzzing. 

Stay tuned for the full technical report and additional PoCs if we confirm exploitability. All findings will be responsibly disclosed to the vendors. 

Greetz to everyone pushing the boundaries of autonomous security research. The machines aren't replacing us yet - but they're making us faster.

---
