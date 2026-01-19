; Custom NSIS installer script for UniPin
; This file is included in the NSIS installer to handle desktop shortcut cleanup
; Handles both old (sticky-notes) and new (UniPin) shortcut names
; Handles OneDrive desktop path and common desktop path

; Function to delete desktop shortcuts (handles old and new names, and all possible locations)
; This function is called during uninstall to ensure all shortcuts are removed
Function un.DeleteDesktopShortcuts
    DetailPrint "Removing desktop shortcuts..."
    
    ; Set shell context to all users first (for common desktop)
    SetShellVarContext all
    
    ; Delete from common/public desktop (All Users Desktop)
    ; Try new name: UniPin.lnk
    Delete "$COMMONDESKTOP\UniPin.lnk"
    ; Try old name: sticky-notes.lnk
    Delete "$COMMONDESKTOP\sticky-notes.lnk"
    
    ; Switch to current user context
    SetShellVarContext current
    
    ; Delete from current user desktop (standard path)
    ; Try new name: UniPin.lnk
    Delete "$DESKTOP\UniPin.lnk"
    ; Try old name: sticky-notes.lnk
    Delete "$DESKTOP\sticky-notes.lnk"
    
    ; Delete from OneDrive desktop path (if OneDrive is enabled)
    ; Get user profile directory
    ReadEnvStr $0 USERPROFILE
    
    ; Try OneDrive desktop paths with different folder names
    ; English folder: Desktop
    Delete "$0\OneDrive\Desktop\UniPin.lnk"
    Delete "$0\OneDrive\Desktop\sticky-notes.lnk"
    
    ; Chinese folder: 桌面
    Delete "$0\OneDrive\桌面\UniPin.lnk"
    Delete "$0\OneDrive\桌面\sticky-notes.lnk"
    
    ; Use PowerShell to find and delete shortcuts in case OneDrive path is non-standard
    ; This is more robust and handles any OneDrive configuration
    ; PowerShell approach: search for shortcuts in any Desktop folder within user profile
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path $env:USERPROFILE -Recurse -Filter \"UniPin.lnk\" -Depth 3 -ErrorAction SilentlyContinue | Where-Object { $_.DirectoryName -match \"Desktop|桌面\" } | Remove-Item -Force -ErrorAction SilentlyContinue"'
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path $env:USERPROFILE -Recurse -Filter \"sticky-notes.lnk\" -Depth 3 -ErrorAction SilentlyContinue | Where-Object { $_.DirectoryName -match \"Desktop|桌面\" } | Remove-Item -Force -ErrorAction SilentlyContinue"'
    
    ; Also check common desktop using PowerShell (more reliable for permission issues)
    ; This works even if uninstaller doesn't have admin rights (though it may not delete common desktop items)
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$commonDesktop = [Environment]::GetFolderPath(\"CommonDesktopDirectory\"); if (Test-Path \"$commonDesktop\UniPin.lnk\") { Remove-Item \"$commonDesktop\UniPin.lnk\" -Force -ErrorAction SilentlyContinue }; if (Test-Path \"$commonDesktop\sticky-notes.lnk\") { Remove-Item \"$commonDesktop\sticky-notes.lnk\" -Force -ErrorAction SilentlyContinue }"'
    
    DetailPrint "Desktop shortcuts cleanup completed."
FunctionEnd

; Hook into the uninstall section
; Tauri will include this file and we need to ensure the function is called
; Note: This function will be called from the uninstall section
; If Tauri doesn't automatically include it, we can use a macro

!macro customUnInstall
    ; Call the function to delete desktop shortcuts
    Call un.DeleteDesktopShortcuts
!macroend
