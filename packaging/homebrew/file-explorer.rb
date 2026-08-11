# typed: strict
# frozen_string_literal: true

cask "file-explorer" do
  version "1.2.0"
  sha256 "509422dfab8da4f119e91a978f7aadffa330ff0be1a6dc8dcb6f75ca8efa86e1"

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
