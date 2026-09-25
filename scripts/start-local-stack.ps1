$ErrorActionPreference = "Stop"

$CogneeDirectory =
    "C:\Progetti\Cognee"

$CogneePython =
    Join-Path `
        $CogneeDirectory `
        ".venv\Scripts\python.exe"

$RuntimeDirectory =
    Join-Path `
        $PSScriptRoot `
        "..\data\local-stack"


function Test-Port {
    param (
        [string]$HostName,
        [int]$Port
    )

    try {
        $connection =
            Test-NetConnection `
                $HostName `
                -Port $Port `
                -WarningAction SilentlyContinue

        return $connection.TcpTestSucceeded
    }
    catch {
        return $false
    }
}


function Wait-ForPort {
    param (
        [string]$Name,
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutSeconds = 45
    )

    $deadline =
        (Get-Date).AddSeconds(
            $TimeoutSeconds
        )

    while (
        (Get-Date) -lt $deadline
    ) {
        if (
            Test-Port `
                $HostName `
                $Port
        ) {
            Write-Host "$Name ready on port $Port."
            return
        }

        Start-Sleep `
            -Milliseconds 750
    }

    throw "$Name did not become ready on port $Port."
}


New-Item `
    -ItemType Directory `
    -Force `
    -Path $RuntimeDirectory |
    Out-Null


Write-Host ""
Write-Host "=== STARTUP LOCAL AI STACK ==="
Write-Host ""


# --------------------------------------------------
# Cognee
# --------------------------------------------------

if (
    Test-Port `
        "127.0.0.1" `
        8000
) {
    Write-Host "Cognee already running."
}
else {
    Write-Host "Starting Cognee..."

    if (
        -not (
            Test-Path $CogneePython
        )
    ) {
        throw "Cognee Python environment not found: $CogneePython"
    }


    Remove-Item `
        Env:ENABLE_BACKEND_ACCESS_CONTROL `
        -ErrorAction SilentlyContinue

    Remove-Item `
        Env:REQUIRE_AUTHENTICATION `
        -ErrorAction SilentlyContinue


    $CogneeOut =
        Join-Path `
            $RuntimeDirectory `
            "cognee.stdout.log"

    $CogneeErr =
        Join-Path `
            $RuntimeDirectory `
            "cognee.stderr.log"


    Start-Process `
        -FilePath $CogneePython `
        -ArgumentList @(
            "-m",
            "uvicorn",
            "cognee.api.client:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000"
        ) `
        -WorkingDirectory $CogneeDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $CogneeOut `
        -RedirectStandardError $CogneeErr


    Wait-ForPort `
        "Cognee" `
        "127.0.0.1" `
        8000
}


# --------------------------------------------------
# OmniRoute
# --------------------------------------------------

if (
    Test-Port `
        "127.0.0.1" `
        20128
) {
    Write-Host "OmniRoute already running."
}

else {
    Write-Host "OmniRoute is not currently running."

    $OmniRouteCommand =
        Get-Command `
            "omniroute" `
            -ErrorAction SilentlyContinue

    if (
        -not $OmniRouteCommand
    ) {
        Write-Warning "OmniRoute command not found in PATH. Startup will continue without OmniRoute."
    }
    else {
        Write-Host "Starting OmniRoute..."

        $OmniOut =
            Join-Path `
                $RuntimeDirectory `
                "omniroute.stdout.log"

        $OmniErr =
            Join-Path `
                $RuntimeDirectory `
                "omniroute.stderr.log"

        try {
            Start-Process `
                -FilePath "cmd.exe" `
                -ArgumentList @(
                    "/c",
                    "omniroute"
                ) `
                -WindowStyle Hidden `
                -RedirectStandardOutput $OmniOut `
                -RedirectStandardError $OmniErr

            Wait-ForPort `
                "OmniRoute" `
                "127.0.0.1" `
                20128
        }
        catch {
            Write-Warning "OmniRoute could not be started. Startup will continue without it."
        }
    }
}
# --------------------------------------------------
# Company Runtime Worker
# --------------------------------------------------

$RuntimePidFile =
    Join-Path `
        $RuntimeDirectory `
        "company-runtime.pid"


function Test-ProcessId {
    param (
        [int]$ProcessId
    )

    if (
        $ProcessId -le 0
    ) {
        return $false
    }

    try {
        $process =
            Get-Process `
                -Id $ProcessId `
                -ErrorAction Stop

        return $null -ne $process
    }
    catch {
        return $false
    }
}


$RuntimeAlreadyRunning =
    $false


if (
    Test-Path $RuntimePidFile
) {
    $storedPid =
        Get-Content `
            $RuntimePidFile `
            -ErrorAction SilentlyContinue

    $parsedPid =
        0

    if (
        [int]::TryParse(
            $storedPid,
            [ref]$parsedPid
        )
    ) {
        if (
            Test-ProcessId `
                $parsedPid
        ) {
            $RuntimeAlreadyRunning =
                $true

            Write-Host `
                "Company Runtime Worker already running (PID $parsedPid)."
        }
        else {
            Remove-Item `
                $RuntimePidFile `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }
}


if (
    -not $RuntimeAlreadyRunning
) {
    Write-Host "Starting Company Runtime Worker..."


    $RuntimeOut =
        Join-Path `
            $RuntimeDirectory `
            "company-runtime.stdout.log"

    $RuntimeErr =
        Join-Path `
            $RuntimeDirectory `
            "company-runtime.stderr.log"


    $StartupDirectory =
        Resolve-Path `
            (Join-Path $PSScriptRoot "..")


    $runtimeProcess =
        Start-Process `
            -FilePath "cmd.exe" `
            -ArgumentList @(
                "/c",
                "npx.cmd tsx scripts/run-company-runtime-worker.ts"
            ) `
            -WorkingDirectory $StartupDirectory `
            -WindowStyle Hidden `
            -RedirectStandardOutput $RuntimeOut `
            -RedirectStandardError $RuntimeErr `
            -PassThru


    Set-Content `
        -Path $RuntimePidFile `
        -Value $runtimeProcess.Id


    Start-Sleep `
        -Seconds 2


    if (
        -not (
            Test-ProcessId `
                $runtimeProcess.Id
        )
    ) {
        throw `
            "Company Runtime Worker exited during startup. Check $RuntimeErr"
    }


    Write-Host `
        "Company Runtime Worker running (PID $($runtimeProcess.Id))."
}


# --------------------------------------------------
# Startup Web App
# --------------------------------------------------

if (
    Test-Port `
        "127.0.0.1" `
        4100
) {
    Write-Host "Startup Web App already running."
}
else {
    Write-Host "Starting Startup Web App..."

    $StartupDirectory =
        Resolve-Path `
            (Join-Path $PSScriptRoot "..")


    $WebOut =
        Join-Path `
            $RuntimeDirectory `
            "startup-web.stdout.log"

    $WebErr =
        Join-Path `
            $RuntimeDirectory `
            "startup-web.stderr.log"


    $webProcess =
        Start-Process `
            -FilePath "cmd.exe" `
            -ArgumentList @(
                "/c",
                "npm.cmd run dev"
            ) `
            -WorkingDirectory $StartupDirectory `
            -WindowStyle Hidden `
            -RedirectStandardOutput $WebOut `
            -RedirectStandardError $WebErr `
            -PassThru


    Wait-ForPort `
        "Startup Web App" `
        "127.0.0.1" `
        4100 `
        60


    Write-Host `
        "Startup Web App running on port 4100."
}

# --------------------------------------------------
# Local Stack Watchdog
# --------------------------------------------------

$WatchdogPidFile =
    Join-Path `
        $RuntimeDirectory `
        "watchdog.pid"


$WatchdogAlreadyRunning =
    $false


if (
    Test-Path $WatchdogPidFile
) {
    $watchdogPid =
        Get-Content `
            $WatchdogPidFile `
            -ErrorAction SilentlyContinue

    $parsedWatchdogPid =
        0


    if (
        [int]::TryParse(
            $watchdogPid,
            [ref]$parsedWatchdogPid
        )
    ) {
        if (
            Test-ProcessId `
                $parsedWatchdogPid
        ) {
            $WatchdogAlreadyRunning =
                $true

            Write-Host `
                "Local Stack Watchdog already running (PID $parsedWatchdogPid)."
        }
    }
}


if (
    -not $WatchdogAlreadyRunning
) {
    Write-Host "Starting Local Stack Watchdog..."


    $WatchdogScript =
        Join-Path `
            $PSScriptRoot `
            "watch-local-stack.ps1"


    $watchdogProcess =
        Start-Process `
            -FilePath "powershell.exe" `
            -ArgumentList @(
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                "`"$WatchdogScript`""
            ) `
            -WindowStyle Hidden `
            -PassThru


    Set-Content `
        -Path $WatchdogPidFile `
        -Value $watchdogProcess.Id


    Write-Host `
        "Local Stack Watchdog running (PID $($watchdogProcess.Id))."
}



Write-Host ""
Write-Host "=== LOCAL STACK READY ==="
Write-Host ""
Write-Host "Cognee:    http://127.0.0.1:8000"
Write-Host "OmniRoute: http://127.0.0.1:20128/v1"
Write-Host "Runtime:   Company Agent Runtime Worker"
Write-Host "App:       http://localhost:4100"
Write-Host "Watchdog:  Automatic recovery enabled"
Write-Host ""