$ErrorActionPreference = "Continue"

$StartupDirectory =
    Resolve-Path `
        (Join-Path $PSScriptRoot "..")

$RuntimeDirectory =
    Join-Path `
        $StartupDirectory `
        "data\local-stack"

$LauncherPath =
    Join-Path `
        $PSScriptRoot `
        "start-local-stack.ps1"

$RuntimePidFile =
    Join-Path `
        $RuntimeDirectory `
        "company-runtime.pid"

$HeartbeatFile =
    Join-Path `
        $RuntimeDirectory `
        "company-runtime-heartbeat.json"

$WatchLog =
    Join-Path `
        $RuntimeDirectory `
        "watchdog.log"


function Write-WatchLog {
    param (
        [string]$Message
    )

    $line =
        "$(Get-Date -Format o) $Message"

    Add-Content `
        -Path $WatchLog `
        -Value $line
}


function Test-Port {
    param (
        [string]$HostName,
        [int]$Port
    )

    try {
        $client =
            New-Object `
                System.Net.Sockets.TcpClient

        $connection =
            $client.BeginConnect(
                $HostName,
                $Port,
                $null,
                $null
            )

        $connected =
            $connection.AsyncWaitHandle.WaitOne(
                1000,
                $false
            )

        if (
            -not $connected
        ) {
            $client.Close()
            return $false
        }

        $client.EndConnect(
            $connection
        )

        $client.Close()

        return $true
    }
    catch {
        return $false
    }
}


function Repair-StaleRuntime {
    if (
        -not (
            Test-Path $HeartbeatFile
        )
    ) {
        if (
            Test-Path $RuntimePidFile
        ) {
            Write-WatchLog `
                "Runtime heartbeat missing. Restart requested."

            $runtimePid =
                Get-Content `
                    $RuntimePidFile `
                    -ErrorAction SilentlyContinue

            if (
                $runtimePid
            ) {
                taskkill `
                    /PID $runtimePid `
                    /T `
                    /F `
                    2>$null |
                    Out-Null
            }

            Remove-Item `
                $RuntimePidFile `
                -Force `
                -ErrorAction SilentlyContinue
        }

        return
    }


    try {
        $heartbeat =
            Get-Content `
                $HeartbeatFile `
                -Raw |
            ConvertFrom-Json


        $lastHeartbeat =
            [DateTimeOffset]::Parse(
                $heartbeat.lastHeartbeatAt
            )


        $ageSeconds =
            (
                [DateTimeOffset]::UtcNow -
                $lastHeartbeat.ToUniversalTime()
            ).TotalSeconds


        if (
            $ageSeconds -le 30
        ) {
            return
        }


        Write-WatchLog `
            "Runtime heartbeat stale ($([math]::Round($ageSeconds, 1))s). Restarting runtime."


        $runtimePid =
            [int]$heartbeat.processId


        taskkill `
            /PID $runtimePid `
            /T `
            /F `
            2>$null |
            Out-Null


        Remove-Item `
            $RuntimePidFile `
            -Force `
            -ErrorAction SilentlyContinue

        Remove-Item `
            $HeartbeatFile `
            -Force `
            -ErrorAction SilentlyContinue
    }
    catch {
        Write-WatchLog `
            "Heartbeat parsing failed. Runtime recovery requested."

        Remove-Item `
            $HeartbeatFile `
            -Force `
            -ErrorAction SilentlyContinue
    }
}


New-Item `
    -ItemType Directory `
    -Force `
    -Path $RuntimeDirectory |
    Out-Null


Write-WatchLog `
    "Startup local watchdog started."


while (
    $true
) {
    try {
        Repair-StaleRuntime


        $needsRepair =
            -not (
                Test-Port `
                    "127.0.0.1" `
                    8000
            ) `
            -or `
            -not (
                Test-Port `
                    "127.0.0.1" `
                    20128
            ) `
            -or `
            -not (
                Test-Port `
                    "127.0.0.1" `
                    4100
            ) `
            -or `
            -not (
                Test-Path $HeartbeatFile
            )


        if (
            $needsRepair
        ) {
            Write-WatchLog `
                "Infrastructure degradation detected. Running recovery launcher."

            & $LauncherPath |
                Out-Null
        }
    }
    catch {
        Write-WatchLog `
            "Watchdog cycle error: $($_.Exception.Message)"
    }


    Start-Sleep `
        -Seconds 10
}