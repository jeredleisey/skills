# Prepare a Windows computer for cadre

Use this page on a Windows 11 laptop before you type `/cadre:setup`. You need no earlier use of Node, the Azure CLI, or a personal access token. You work on Azure DevOps (ADO). When each check on this page passes, setup does not stop on a missing tool or token.

Each step gives a command to copy, then the output that you should see.

## What you need

On Windows, Claude Code has a PowerShell tool. Git for Windows adds a Bash tool, which runs Git Bash. With both tools on a claude.ai or Console account, Claude uses PowerShell first. The cadre skills write their commands for Bash, and [the cadre guards](../reference/guards.md) check the Bash tool only. So install Git for Windows, and make sure that each item works in Git Bash.

| Item | Section |
| --- | --- |
| Git for Windows, with Git Bash | [Git for Windows](#git-for-windows) |
| Node 22 or later | [Node 22 or later](#node-22-or-later) |
| Claude Code | [Claude Code](#claude-code) |
| The Azure CLI and its `azure-devops` extension | [Azure CLI](#azure-cli-and-the-azure-devops-extension) |
| A personal access token in `AZURE_DEVOPS_EXT_PAT` | [The token](#the-personal-access-token) |
| A full editor restart | [Restart the editor](#restart-the-editor) |

If your company manages the laptop, you may need its software portal or IT to install a program. Ask them for the same program. Use the same version rules as below.

## Git for Windows

Open PowerShell. Run:

```powershell
winget install --id Git.Git -e
```

You can also use the installer from <https://git-scm.com/downloads>.

Open Git Bash from the Start menu. Run:

```bash
git --version
```

You see a line that starts with `git version 2`. Git for Windows gives you Git Bash and Git Credential Manager. Git Credential Manager signs you in to ADO when you use `git push`.

## Node 22 or later

Run in PowerShell:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

You can also use the LTS installer from <https://nodejs.org>.

Open a NEW terminal. An open terminal does not see the new program. Run in Git Bash:

```bash
node --version
```

You see `v22` or a later number.

## Claude Code

Install Claude Code with the steps at <https://code.claude.com/docs>. You use it in one of three places:

- the terminal (the `claude` command)
- the Claude desktop app (the Code tab)
- the VS Code extension

Cadre works the same in each place. Check that Claude Code starts and answers.

## Azure CLI and the azure-devops extension

Run in PowerShell:

```powershell
winget install --id Microsoft.AzureCLI -e
```

Open a NEW terminal. Run in Git Bash:

```bash
az --version
az extension add --name azure-devops
az extension show --name azure-devops
```

The first command shows a list of versions. The last command shows a block of text with `"name": "azure-devops"`.

Setup opens the charter pull request with `az repos pr create`. `/cadre:ticket` uses `az boards` and `az repos`. The orchestrator completes a pull request with `az repos pr update`. So install the extension before you run setup. If `az extension add` fails with a certificate error, go to [Behind a TLS-inspecting proxy](#behind-a-tls-inspecting-proxy).

## The personal access token

A personal access token (PAT) is a password that ADO makes for you. Cadre reads it from the variable `AZURE_DEVOPS_EXT_PAT`.

### Make the token

1. Open ADO in your browser.
2. Open **User settings**, then **Personal access tokens**.
3. Choose **New Token**.
4. Give it a name and an expiry date. Choose a short expiry. When it ends, make a new token and repeat the next part.
5. Choose these scopes:
   - **Work Items**: Read and write.
   - **Code**: Read and write.
6. Choose **Create**. Copy the token. ADO shows it only one time.

### Store the token

The token is now on your clipboard. Open PowerShell. Run all three lines:

```powershell
[Environment]::SetEnvironmentVariable('AZURE_DEVOPS_EXT_PAT', (Get-Clipboard).Trim(), 'User')
"length=" + [Environment]::GetEnvironmentVariable('AZURE_DEVOPS_EXT_PAT','User').Length
Set-Clipboard -Value ' '
```

The second line prints the length. An ADO token usually has 52 or 84 characters. The third line clears the clipboard. If Win+V clipboard history is on, delete the token entry there.

Never print the token. Check only the length.

A User environment variable is plain text. Your own programs can read it. It is weaker than a keychain. Keep the token scopes small and the expiry short.

Do not run `az login` as a fix. The token is the way in.

## Restart the editor

A program copies its environment one time, when it starts. A new variable does not reach a program that is already open.

For VS Code:

1. Quit EVERY VS Code window. Look in the system tray for a copy that is still open.
2. Start VS Code from the Start menu.

Do not use `code .` from a terminal that was open before you set the variable. That terminal has the old environment. If a VS Code window is still open, `code .` only adds a window to the same process.

A new chat is not a new process. The extension gets its environment from VS Code. So a new chat does not help.

For the Claude desktop app: quit it fully, then start it again. For the terminal: open a new terminal.

## Ready check

Run this block in Git Bash, or ask Claude Code to run it. Put your ADO organization name in place of `<org>`, and the project of your repo in place of `<project>`. Write a space in the project name as `%20`. This is the same read that setup does first.

```bash
node --version
git --version
az extension show --name azure-devops --query version -o tsv
[ -n "$AZURE_DEVOPS_EXT_PAT" ] && echo "token set, length ${#AZURE_DEVOPS_EXT_PAT}" || echo "token EMPTY"
curl -s -o /dev/null -w "%{http_code}\n" -u ":$AZURE_DEVOPS_EXT_PAT" "https://dev.azure.com/<org>/<project>/_apis/wit/workitemtypes?api-version=7.1"
```

You should see:

- a Node version of `v22` or later
- a Git version
- a version number of the extension
- `token set, length 52` or a similar length
- `200`

The last line is the HTTP status. The block never prints the token or the body of the answer.

- `200` is good.
- `203` or `302` means ADO refused the token. Check that the token is not empty, then check that it did not expire.
- `401` means ADO refused the token. Check that it did not expire, and that you copied all of it.
- `403` means the token has no access to the project. Make a token with the two scopes above.
- `404` means a wrong organization or project name.

When every line is good, go on to [Set up cadre on an Azure DevOps repo](set-up-on-azure-devops.md) or [Your first orchestrator on Azure DevOps](../tutorials/first-orchestrator-ado.md).

## Behind a TLS-inspecting proxy

Some company networks use a proxy that re-signs every HTTPS site with a company certificate authority (CA). Windows trusts that CA. So browsers, PowerShell, and Node work with no change. The cadre scripts work. The core of `az` works.

Tools with their own list of CAs can fail:

- `az extension add` can fail with a certificate error, because it uses its own bundled Python.
- Python 3.13 and later check certificates strictly. They can fail with `certificate verify failed: Missing Authority Key Identifier`. Cadre itself needs no Python.

### Install the extension from a file

Download the extension file in PowerShell, which uses the Windows certificate store. Check its hash. Install from the file:

```powershell
$idx = Invoke-RestMethod 'https://azcliextensionsync.blob.core.windows.net/index1/index.json'
$e = $idx.extensions.'azure-devops' | Sort-Object { [version]$_.metadata.version } | Select-Object -Last 1
$whl = Join-Path $env:TEMP $e.filename
Invoke-WebRequest $e.downloadUrl -OutFile $whl
(Get-FileHash $whl -Algorithm SHA256).Hash.ToLower() -eq $e.sha256Digest.ToLower()
az extension add --source $whl --yes
```

The fifth line must print `True`. If it prints `False`, stop. Do not install the file.

Until the extension is in, the orchestrator still reads and writes work items with REST. Setup, `/cadre:ticket`, and each pull request step need the extension.

### Find who signs the certificate

In Git Bash, show the signers of one host:

```bash
echo | openssl s_client -connect dev.azure.com:443 -servername dev.azure.com -showcerts 2>/dev/null | grep -E "^ *[0-9] s:|^ *i:"
```

In PowerShell, list the roots that Windows trusts. Look for the name of your company:

```powershell
Get-ChildItem Cert:\LocalMachine\Root | Select-Object Subject, NotAfter, Thumbprint
```

If a signer in the first list is the name of your company, a proxy is on your network. Ask IT for a standard CA bundle file. It is the best fix, because it works for each tool.
