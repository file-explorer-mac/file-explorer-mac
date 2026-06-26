# typed: strict
# frozen_string_literal: true

cask "file-explorer" do
  version "1.0.0"
  sha256 "c1d15f72c013be9a2a27ad3ef8c818c7a46b9ee43ff10850ce4761d49e6e3649"

  url "https://github.com/file-explorer-mac/file-explorer-mac/releases/download/v#{version}/File-Explorer-#{version}-universal.dmg",
      verified: "github.com/file-explorer-mac/file-explorer-mac/"
  name "File Explorer"
  desc "Modern, tabbed file manager"
  homepage "https://github.com/file-explorer-mac/file-explorer-mac"

  depends_on macos: :big_sur

  app "File Explorer.app"

  zap trash: [
    "~/Library/Application Support/File Explorer",
    "~/Library/Caches/com.fileexplorer.app",
    "~/Library/HTTPStorages/com.fileexplorer.app",
    "~/Library/Preferences/com.fileexplorer.app.plist",
    "~/Library/Saved Application State/com.fileexplorer.app.savedState",
  ]
end
