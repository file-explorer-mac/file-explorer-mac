# Homebrew Cask for File Explorer.
#
# Submit to homebrew/cask AFTER v1.0.0 is published as a GitHub Release. Before
# submitting, fill in the real sha256 of the published universal .dmg:
#
#   shasum -a 256 "File Explorer-1.0.0-universal.dmg"
#
# NOTE: GitHub release-asset URLs replace spaces with ".". Either match the
# uploaded asset name exactly, or (recommended) set electron-builder's
# `artifactName` to a space-free name like "FileExplorer-${version}-universal.dmg"
# so the cask URL is clean and passes `brew audit`.
cask "file-explorer" do
  version "1.0.0"
  sha256 "REPLACE_WITH_DMG_SHA256"

  url "https://github.com/file-explorer-mac/file-explorer-mac/releases/download/v#{version}/File.Explorer-#{version}-universal.dmg",
      verified: "github.com/file-explorer-mac/file-explorer-mac/"
  name "File Explorer"
  desc "Modern, tabbed file manager for macOS"
  homepage "https://github.com/file-explorer-mac/file-explorer-mac"

  depends_on macos: ">= :big_sur"

  app "File Explorer.app"

  zap trash: [
    "~/Library/Application Support/File Explorer",
    "~/Library/Caches/com.fileexplorer.app",
    "~/Library/HTTPStorages/com.fileexplorer.app",
    "~/Library/Preferences/com.fileexplorer.app.plist",
    "~/Library/Saved Application State/com.fileexplorer.app.savedState",
  ]
end
