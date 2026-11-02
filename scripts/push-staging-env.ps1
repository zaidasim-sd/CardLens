# push-staging-env.ps1
# Pushes all staging environment variables to Vercel Preview environment.
# Scoped to Preview only — never touches Production.
# Run from the d:\CardLens directory after `vercel login`.

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Continue"

# Staging env var names — values match the corrected .env
# Values must be supplied in the launching process environment. Never embed credentials here.
$variableNames = @(
    "PORT",
    "APP_ENV",
    "OCR_PROVIDER_MODE",
    "GOOGLE_VISION_API_KEY",
    "OCR_SPACE_API_KEY",
    "OCR_MONTHLY_CAP",
    "MONGODB_URI",
    "MONGODB_DB",
    "MONGODB_DNS_SERVERS",
    "APP_BASE_URL",
    "APP_ORIGIN",
    "APPROVAL_BASE_URL",
    "ALLOWED_ORIGINS",
    "DEMO_MODE",
    "ENCRYPTION_KEY",
    "ENCRYPTION_KEY_VERSION",
    "DATA_KEY",
    "APP_TIME_ZONE",
    "FIREBASE_API_KEY",
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_MEASUREMENT_ID",
    "ALLOW_VISION71_EMAILS",
    "VITE_ALLOW_VISION71_EMAILS",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "HALA_APPROVAL_EMAIL",
    "OSMAN_APPROVAL_EMAIL",
    "STAGING_EMAIL_ALLOWLIST",
    "STAGING_ALLOWED_DOMAINS",
    "VITE_IS_STAGING",
    "GOOGLE_SHEET_ID",
    "GOOGLE_SHEET_TAB",
    "GOOGLE_SHEET_TAB_ID",
    "SHEET_TARGET_APPROVED",
    "SHEET_REVIEWER_NAME",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    "VITE_CONFIRMED_EXHIBITION",
    "CONFIRMED_EXHIBITION",
    "VITE_ENABLE_BATCH_CAPTURE",
    "VITE_BATCH_CAPTURE_ALLOW_STAGING_OCR",
    "GEMINI_API_KEY",
    "BACKUP_KEY",
    "CRON_SECRET"
)
$vars = [ordered]@{}
foreach ($variableName in $variableNames) {
    $vars[$variableName] = [Environment]::GetEnvironmentVariable($variableName, "Process")
}

$total = $vars.Count
$i = 0
$failed = @()

foreach ($key in $vars.Keys) {
    $i++
    $value = $vars[$key]
    Write-Host "[$i/$total] $key" -NoNewline

    if ($DryRun) {
        Write-Host " (dry-run)" -ForegroundColor Yellow
        continue
    }

    try {
        # Skip empty values
        if ([string]::IsNullOrWhiteSpace($value)) {
            Write-Host " (skipped — empty)" -ForegroundColor DarkGray
            continue
        }

        # Remove existing Preview-scoped var first to allow clean add
        $removeOut = ($value | & vercel env rm $key preview --yes 2>&1)

        # Add scoped to preview
        $addOut = ($value | & vercel env add $key preview 2>&1)

        if ($LASTEXITCODE -eq 0) {
            Write-Host " ✓" -ForegroundColor Green
        } else {
            Write-Host " ✗ $addOut" -ForegroundColor Red
            $failed += $key
        }
    } catch {
        Write-Host " ✗ $_" -ForegroundColor Red
        $failed += $key
    }
}

if ($failed.Count -gt 0) {
    Write-Host "`nFailed vars ($($failed.Count)): $($failed -join ', ')" -ForegroundColor Red
} else {
    Write-Host "`nAll $total env vars pushed to Vercel Preview environment." -ForegroundColor Green
}
