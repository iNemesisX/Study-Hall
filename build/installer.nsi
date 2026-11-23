; Study Hall installer (NSIS). Per-user install: no administrator rights needed.
; Build: npm run dist:linux  (or: makensis -DVERSION=2.2.0 -DAPPDIR="../dist/Study Hall" -DOUTFILE="../dist/StudyHall Installer.exe" installer.nsi)
Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!define APP "Study Hall"
!define EXE "Study Hall.exe"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\StudyHall"

Name "${APP}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "Software\StudyHall" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "${APP} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "${APP} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "${APP}"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "Study Hall turns photos of slides, textbook pages and handwritten work into organized notes, flashcards, practice tests and study guides.$\r$\n$\r$\nSetup installs it for your Windows account only. Your notebooks and flashcard sets are kept when you update or reinstall.$\r$\n$\r$\nClose Study Hall if it is open, then click Next."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open Study Hall"

!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

; Always install into a folder of its own, so Setup and Uninstall never touch other files.
Function DirLeave
  ${GetFileName} "$INSTDIR" $0
  StrCmp $0 "${APP}" done
  StrCpy $INSTDIR "$INSTDIR\${APP}"
  done:
FunctionEnd

Section "Install"
  ; Automatic updates run Setup silently (/S) right after Study Hall closes: give it a moment to exit.
  ${If} ${Silent}
    Sleep 3000
  ${EndIf}
  SetOutPath "$INSTDIR"
  ; Clear the previous version's program files first (user data lives in %APPDATA% and is not touched).
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\resources"
  File /r "${APPDIR}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall ${APP}.exe"

  CreateShortcut "$SMPROGRAMS\${APP}.lnk" "$INSTDIR\${EXE}"
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}"

  WriteRegStr HKCU "Software\StudyHall" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "${APP}"
  WriteRegStr HKCU "${REGKEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\Uninstall ${APP}.exe"'
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${REGKEY}" "EstimatedSize" "$0"
SectionEnd

; After a silent (automatic) update, open Study Hall again.
Function .onInstSuccess
  ${If} ${Silent}
    Exec '"$INSTDIR\${EXE}"'
  ${EndIf}
FunctionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${APP}.lnk"
  Delete "$DESKTOP\${APP}.lnk"
  ; Only remove what Setup installed; notebooks and sets in %APPDATA%\Study Hall stay.
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\resources"
  Delete "$INSTDIR\Study Hall.exe"
  Delete "$INSTDIR\Uninstall Study Hall.exe"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vulkan-1.dll"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${REGKEY}"
  DeleteRegKey HKCU "Software\StudyHall"
SectionEnd
