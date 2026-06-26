// @vitest-environment node
import { describe, it, expect } from 'vitest'
import type { FileKind } from './types'
import { classifyKind, kindLabel } from './fileKinds'

describe('classifyKind', () => {
  it('classifies a plain directory as folder', () => {
    expect(classifyKind({ isDirectory: true, ext: '', name: 'Documents' })).toBe('folder')
  })

  it('classifies a directory ending in .app as app (case-insensitive)', () => {
    expect(classifyKind({ isDirectory: true, ext: '', name: 'Safari.app' })).toBe('app')
    expect(classifyKind({ isDirectory: true, ext: 'app', name: 'Safari.APP' })).toBe('app')
  })

  it('does not treat a non-directory .app entry as app', () => {
    // The .app check only applies to directories; a file named *.app falls
    // through to the ext map (here 'app' is unknown → 'file').
    expect(classifyKind({ isDirectory: false, ext: 'app', name: 'Safari.app' })).toBe('file')
  })

  it('classifies a known extension via the ext map', () => {
    expect(classifyKind({ isDirectory: false, ext: 'png', name: 'pic.png' })).toBe('image')
    expect(classifyKind({ isDirectory: false, ext: 'mp4', name: 'clip.mp4' })).toBe('video')
    expect(classifyKind({ isDirectory: false, ext: 'mp3', name: 'song.mp3' })).toBe('audio')
    expect(classifyKind({ isDirectory: false, ext: 'pdf', name: 'doc.pdf' })).toBe('pdf')
    expect(classifyKind({ isDirectory: false, ext: 'docx', name: 'doc.docx' })).toBe('document')
    expect(classifyKind({ isDirectory: false, ext: 'csv', name: 'data.csv' })).toBe('spreadsheet')
    expect(classifyKind({ isDirectory: false, ext: 'pptx', name: 'deck.pptx' })).toBe(
      'presentation'
    )
    expect(classifyKind({ isDirectory: false, ext: 'zip', name: 'a.zip' })).toBe('archive')
    expect(classifyKind({ isDirectory: false, ext: 'dmg', name: 'a.dmg' })).toBe('disk-image')
    expect(classifyKind({ isDirectory: false, ext: 'ts', name: 'a.ts' })).toBe('code')
    expect(classifyKind({ isDirectory: false, ext: 'txt', name: 'a.txt' })).toBe('text')
    expect(classifyKind({ isDirectory: false, ext: 'ttf', name: 'a.ttf' })).toBe('font')
    expect(classifyKind({ isDirectory: false, ext: 'exe', name: 'a.exe' })).toBe('executable')
  })

  it('falls back to file for an unknown extension', () => {
    expect(classifyKind({ isDirectory: false, ext: 'xyz', name: 'weird.xyz' })).toBe('file')
    expect(classifyKind({ isDirectory: false, ext: '', name: 'README' })).toBe('file')
  })
})

describe('kindLabel', () => {
  it('labels folder', () => {
    expect(kindLabel({ kind: 'folder', ext: '' })).toBe('File folder')
  })

  it('labels drive', () => {
    expect(kindLabel({ kind: 'drive', ext: '' })).toBe('Local Disk')
  })

  it('labels app', () => {
    expect(kindLabel({ kind: 'app', ext: 'app' })).toBe('Application')
  })

  it('labels image with and without ext', () => {
    expect(kindLabel({ kind: 'image', ext: 'png' })).toBe('PNG Image')
    expect(kindLabel({ kind: 'image', ext: '' })).toBe('Image')
  })

  it('labels video with and without ext', () => {
    expect(kindLabel({ kind: 'video', ext: 'mp4' })).toBe('MP4 Video')
    expect(kindLabel({ kind: 'video', ext: '' })).toBe('Video')
  })

  it('labels audio with and without ext', () => {
    expect(kindLabel({ kind: 'audio', ext: 'mp3' })).toBe('MP3 Audio')
    expect(kindLabel({ kind: 'audio', ext: '' })).toBe('Audio')
  })

  it('labels pdf', () => {
    expect(kindLabel({ kind: 'pdf', ext: 'pdf' })).toBe('PDF Document')
  })

  it('labels document', () => {
    expect(kindLabel({ kind: 'document', ext: 'docx' })).toBe('Document')
  })

  it('labels spreadsheet', () => {
    expect(kindLabel({ kind: 'spreadsheet', ext: 'csv' })).toBe('Spreadsheet')
  })

  it('labels presentation', () => {
    expect(kindLabel({ kind: 'presentation', ext: 'pptx' })).toBe('Presentation')
  })

  it('labels archive', () => {
    expect(kindLabel({ kind: 'archive', ext: 'zip' })).toBe('Archive')
  })

  it('labels disk-image', () => {
    expect(kindLabel({ kind: 'disk-image', ext: 'dmg' })).toBe('Disk Image')
  })

  it('labels code with and without ext', () => {
    expect(kindLabel({ kind: 'code', ext: 'ts' })).toBe('TS File')
    expect(kindLabel({ kind: 'code', ext: '' })).toBe('Code File')
  })

  it('labels text with and without ext', () => {
    expect(kindLabel({ kind: 'text', ext: 'txt' })).toBe('TXT File')
    expect(kindLabel({ kind: 'text', ext: '' })).toBe('Text Document')
  })

  it('labels font', () => {
    expect(kindLabel({ kind: 'font', ext: 'ttf' })).toBe('Font File')
  })

  it('labels executable', () => {
    expect(kindLabel({ kind: 'executable', ext: 'exe' })).toBe('Executable')
  })

  it('uses the default branch for the generic file kind, with and without ext', () => {
    expect(kindLabel({ kind: 'file', ext: 'xyz' })).toBe('XYZ File')
    expect(kindLabel({ kind: 'file', ext: '' })).toBe('File')
  })

  it('falls through default for any unrecognized kind value', () => {
    // Defensive: a value outside the union still hits the default branch.
    expect(kindLabel({ kind: 'bogus' as FileKind, ext: 'foo' })).toBe('FOO File')
    expect(kindLabel({ kind: 'bogus' as FileKind, ext: '' })).toBe('File')
  })
})
