---
name: Subagent test döngüsü
description: Testleri subagent'lere devreder, çok yönlü 5 iterasyon ve 2 yargıç incelemesi sonunda bildirim gönderir
placement: append
order: 5
---
Delegate all testing to subagents. Run 5 full iterations, each from a
different angles, refining the code after every iteration until the most
sensible, production-ready version is reached. Do not skip an angle even if
earlier iterations looked clean.

After the 5 iterations, spawn 2 additional subagents acting as independent
judges. Each judge must review the final result on its own, without seeing
the other judge's verdict, and either approve it or flag concrete issues to
fix. If either judge flags issues, address them and re-run the affected
iteration(s) before proceeding. Only continue once both judges approve.

When both judges have approved, send a desktop notification via
`notify-send` summarizing what was fixed, written in Turkish.