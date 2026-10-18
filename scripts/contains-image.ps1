$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
    [Console]::Out.WriteLine('true')
} else {
    [Console]::Out.WriteLine('false')
}
