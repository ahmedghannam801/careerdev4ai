Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class CredReader {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public UInt32 Flags;
        public UInt32 Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, uint type, int reservedFlag, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr cred);

    public static byte[] ReadBytes(string target) {
        IntPtr ptr;
        if (!CredRead(target, 1, 0, out ptr)) {
            throw new InvalidOperationException("CredRead failed: " + Marshal.GetLastWin32Error());
        }
        try {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            byte[] data = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, data, 0, (int)cred.CredentialBlobSize);
            return data;
        } finally {
            CredFree(ptr);
        }
    }
}
'@

$bytes = [CredReader]::ReadBytes('Supabase CLI:supabase')
$token = [System.Text.Encoding]::UTF8.GetString($bytes).TrimEnd([char]0)

# The token is written to a file outside the repository so no secret ever
# lands in source control.
$target = Join-Path $env:TEMP 'careerpilot-supabase-token.txt'
[System.IO.File]::WriteAllText($target, $token)
Write-Output ("TOKEN_LENGTH=" + $token.Length)
Write-Output "TOKEN_WRITTEN"
