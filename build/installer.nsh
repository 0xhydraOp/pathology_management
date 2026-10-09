; Extra guarantee: Desktop + Start Menu shortcuts (runs after app files are installed).
; Variables are provided by electron-builder (see app-builder-lib NSIS templates).

 ; Unsigned offline candidate: no activation service is required.
!macro customInit
  MessageBox MB_OK|MB_ICONEXCLAMATION "Pathology Management System - unsigned offline candidate.$\r$\n$\r$\nSetup and daily operation require no internet or activation. Create your local administrator account on first run.$\r$\n$\r$\nBack up before upgrading. Read OFFLINE_RELEASE.md and RECOVERY.md. Clinical validation and wider Windows/printer testing remain pending." /SD IDOK
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
