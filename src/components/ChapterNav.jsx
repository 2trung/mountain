import { CHAPTERS } from '../config/chapters'
import { setChapter, useChapter } from '../state/chapterStore'

// Frosted bottom navigator that replaces the leva dropdown. A single pill
// indicator slides between the four chapters; clicking an item writes the
// active index to the chapter store, which TransitionDriver picks up.
export function ChapterNav() {
  const active = useChapter()

  return (
    <nav className='chapter-nav' aria-label='Chapters'>
      <div className='chapter-nav__track'>
        <span
          className='chapter-nav__indicator'
          style={{ transform: `translateX(${active * 100}%)` }}
        />
        {CHAPTERS.map((c, i) => (
          <button
            key={c.key}
            type='button'
            className={`chapter-nav__item${i === active ? ' is-active' : ''}`}
            onClick={() => setChapter(i)}
            aria-current={i === active}
          >
            <span className='chapter-nav__index'>{String(i + 1).padStart(2, '0')}</span>
            <span className='chapter-nav__label'>{c.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
