import { describe, it, expect } from 'vitest'
import {
  HOME_PATH,
  basename,
  parentPath,
  displayName,
  toSegments,
  type Segment
} from './pathUtils'

const HOME = '/Users/test'

describe('pathUtils', () => {
  describe('HOME_PATH', () => {
    it('is the virtual home sentinel', () => {
      expect(HOME_PATH).toBe('home://')
    })
  })

  describe('basename', () => {
    it('returns "/" for the filesystem root', () => {
      expect(basename('/')).toBe('/')
    })

    it('strips a single trailing slash before taking the leaf', () => {
      expect(basename('/Users/test/docs/')).toBe('docs')
    })

    it('returns the leaf for a normal path', () => {
      expect(basename('/Users/test/file.txt')).toBe('file.txt')
    })

    it('returns the whole string when there is no slash', () => {
      expect(basename('loose')).toBe('loose')
    })

    it('returns an empty string for a top-level absolute path', () => {
      // "/etc" -> trimmed "/etc" -> idx 0 -> slice(1) -> "etc"
      expect(basename('/etc')).toBe('etc')
    })
  })

  describe('parentPath', () => {
    it('returns "/" for the filesystem root', () => {
      expect(parentPath('/')).toBe('/')
    })

    it('returns "/" when the parent is the root (idx <= 0)', () => {
      expect(parentPath('/etc')).toBe('/')
    })

    it('returns the parent directory for a nested path', () => {
      expect(parentPath('/Users/test/docs')).toBe('/Users/test')
    })

    it('ignores a trailing slash when computing the parent', () => {
      expect(parentPath('/Users/test/docs/')).toBe('/Users/test')
    })

    it('returns "/" for a relative single segment (lastIndexOf is -1)', () => {
      // "loose" -> idx -1 -> idx <= 0 -> "/"
      expect(parentPath('loose')).toBe('/')
    })
  })

  describe('displayName', () => {
    it('labels the virtual home sentinel as "Home"', () => {
      expect(displayName(HOME_PATH, HOME)).toBe('Home')
    })

    it('labels the filesystem root as "Macintosh HD"', () => {
      expect(displayName('/', HOME)).toBe('Macintosh HD')
    })

    it('labels the user home directory as "Home"', () => {
      expect(displayName(HOME, HOME)).toBe('Home')
    })

    it('does not collapse to Home when homeDir is empty even if path matches ""', () => {
      // homeDir falsy short-circuits the `homeDir && p === homeDir` branch.
      expect(displayName('/some/dir', '')).toBe('dir')
    })

    it('returns the bare volume name for a /Volumes leaf', () => {
      expect(displayName('/Volumes/USB Drive', HOME)).toBe('USB Drive')
    })

    it('falls back to basename for a nested path inside /Volumes', () => {
      expect(displayName('/Volumes/USB Drive/photos', HOME)).toBe('photos')
    })

    it('falls back to basename for a generic path', () => {
      expect(displayName('/Users/test/docs/report.pdf', HOME)).toBe('report.pdf')
    })
  })

  describe('toSegments', () => {
    it('returns a single root-level crumb for the virtual home page', () => {
      expect(toSegments(HOME_PATH, HOME)).toEqual([{ name: 'Home', path: HOME_PATH }])
    })

    it('builds root + parts for a path outside the home dir', () => {
      const segs = toSegments('/etc/hosts', HOME)
      expect(segs).toEqual<Segment[]>([
        { name: 'Macintosh HD', path: '/' },
        { name: 'etc', path: '/etc' },
        { name: 'hosts', path: '/etc/hosts' }
      ])
    })

    it('returns just the root drive crumb for "/"', () => {
      // "/".split('/').filter(Boolean) -> [] -> only the root crumb.
      expect(toSegments('/', HOME)).toEqual<Segment[]>([
        { name: 'Macintosh HD', path: '/' }
      ])
    })

    it('does not collapse when homeDir is empty (falsy guard)', () => {
      const segs = toSegments('/a/b', '')
      expect(segs).toEqual<Segment[]>([
        { name: 'Macintosh HD', path: '/' },
        { name: 'a', path: '/a' },
        { name: 'b', path: '/a/b' }
      ])
    })

    it('collapses the home directory itself into a single Home crumb', () => {
      // p === homeDir startsWith homeDir; homeParts = 2; collapsed starts at Home,
      // loop i from 3.. < segs.length(3) -> no extra parts appended.
      const segs = toSegments(HOME, HOME)
      expect(segs).toEqual<Segment[]>([{ name: 'Home', path: HOME }])
    })

    it('collapses home and appends nested crumbs below it', () => {
      // segs for /Users/test/docs/report:
      //   ['/', '/Users', '/Users/test', '/Users/test/docs', '/Users/test/docs/report']
      // homeParts = 2 -> append segs[3], segs[4].
      const segs = toSegments('/Users/test/docs/report', HOME)
      expect(segs).toEqual<Segment[]>([
        { name: 'Home', path: HOME },
        { name: 'docs', path: '/Users/test/docs' },
        { name: 'report', path: '/Users/test/docs/report' }
      ])
    })

    it('collapses home with a single child below it', () => {
      const segs = toSegments('/Users/test/docs', HOME)
      expect(segs).toEqual<Segment[]>([
        { name: 'Home', path: HOME },
        { name: 'docs', path: '/Users/test/docs' }
      ])
    })

    it('treats a sibling sharing the home prefix string as "inside" home (prefix-match behavior)', () => {
      // '/Users/testbed' startsWith '/Users/test' is true, so the collapse branch runs.
      // homeParts = 2, segs = ['/', '/Users', '/Users/testbed']; loop i from 3 < 3 -> none.
      // Result is a lone Home crumb pointing at homeDir, even though the path is a sibling.
      const segs = toSegments('/Users/testbed', HOME)
      expect(segs).toEqual<Segment[]>([{ name: 'Home', path: HOME }])
    })
  })
})
