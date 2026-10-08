; Extra guarantee: Desktop + Start Menu shortcuts (runs after app files are installed).
; Variables are provided by electron-builder (see app-builder-lib NSIS templates).

; Remove only as part of a separately reviewed activation-ready production release.
!macro customInit
  MessageBox MB_OK|MB_ICONEXCLAMATION "Patholy Management System — activation-pending prerelease.$\r$\n$\r$\nNo production activation service is configured. New registration, result editing and report finalization are unavailable.$\r$\n$\r$\nThis unsigned evaluation build is not for production lab use. Read PRERELEASE.md before continuing." /SD IDOK
!macroend

!macro customInstall
  CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0
  ClearErrors
  !ifdef APP_ID
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  !endif
  !ifdef MENU_FILENAME
    CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
    CreateShortCut "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0
    ClearErrors
    !ifdef APP_ID
      WinShell::SetLnkAUMI "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    !endif
  !else
    CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0
    ClearErrors
    !ifdef APP_ID
      WinShell::SetLnkAUMI "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    !endif
  !endif
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
