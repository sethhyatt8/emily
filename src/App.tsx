import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventInput } from '@fullcalendar/core'
import { supabase } from './lib/supabase'
import './App.css'

type CalendarEvent = {
  id: string
  title: string
  start_at: string
  end_at: string | null
  all_day: boolean
  description: string | null
  color: string | null
  countdown: boolean
}

type CalendarEventRow = Omit<CalendarEvent, 'countdown'> & { countdown?: boolean }

type EventForm = {
  id: string | null
  title: string
  startAt: string
  endAt: string
  allDay: boolean
  countdown: boolean
  notes: string
  color: string
}

type DateClickInfo = {
  allDay: boolean
  dateStr: string
}

type DreamTripItem = {
  id: string
  description: string
  linkText: string
  color: string
  created_at?: string
}

const DEFAULT_COLOR = '#2563eb'
const DEFAULT_TRIP_COLOR = '#fef3c7'

/** Add PNGs under `public/ads/` — default names `ad-1.png` … `ad-4.png`, or edit `file` here. */
type SponsoredAdCard = {
  file: string
  alt: string
  href?: string
}

const SPONSORED_AD_CARDS: SponsoredAdCard[] = [
  { file: 'ad-1.png', alt: 'Sponsored slide 1' },
  { file: 'ad-2.png', alt: 'Sponsored slide 2' },
  { file: 'ad-3.png', alt: 'Sponsored slide 3' },
  { file: 'ad-4.png', alt: 'Sponsored slide 4' },
]

const SPONSORED_TEXT_FALLBACK = [
  'Escape Flights - 40% off weekend getaways',
  'Sunny Suites - Book now, pay later',
  'MealDash - Romantic dinner delivered in 20 min',
  'RoadTrip+ - Compare rental cars instantly',
]

const SPONSORED_SLIDE_MS = 5000

function sponsoredAdSrc(file: string): string {
  return `${import.meta.env.BASE_URL}ads/${file}`
}

function SponsoredSlideshow({ cards }: { cards: SponsoredAdCard[] }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (cards.length <= 1) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % cards.length)
    }, SPONSORED_SLIDE_MS)
    return () => window.clearInterval(id)
  }, [cards.length])

  if (cards.length === 0) {
    return (
      <div className="ads-slideshow ads-slideshow--empty">
        {SPONSORED_TEXT_FALLBACK.map((line, i) => (
          <p key={i} className="ads-fallback-line">
            {line}
          </p>
        ))}
      </div>
    )
  }

  const card = cards[index]
  const src = sponsoredAdSrc(card.file)
  const img = (
    <img
      key={index}
      className="ads-slide-img"
      src={src}
      alt={card.alt}
      loading={index === 0 ? 'eager' : 'lazy'}
      decoding="async"
    />
  )

  return (
    <div className="ads-slideshow" aria-live="polite" aria-atomic="true">
      {card.href ? (
        <a className="ads-slide-link" href={card.href} target="_blank" rel="noopener noreferrer">
          {img}
        </a>
      ) : (
        img
      )}
    </div>
  )
}

const toDateInput = (iso: string): string => {
  const d = new Date(iso)
  const offset = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return offset.toISOString().slice(0, 10)
}

const toDatetimeInput = (iso: string): string => {
  const d = new Date(iso)
  const offset = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return offset.toISOString().slice(0, 16)
}

const toIso = (value: string, allDay: boolean): string | null => {
  if (!value) return null
  const raw = allDay ? `${value}T00:00:00` : value
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

const addHours = (iso: string, hours: number): string => {
  const d = new Date(iso)
  d.setHours(d.getHours() + hours)
  return d.toISOString()
}

const addDays = (iso: string, days: number): string => {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

const toAllDayEndInput = (event: CalendarEvent): string => {
  if (!event.end_at) return toDateInput(event.start_at)
  const start = new Date(event.start_at)
  const endExclusive = new Date(event.end_at)
  if (endExclusive <= start) return toDateInput(event.start_at)
  return toDateInput(addDays(event.end_at, -1))
}

const getEventTextColor = (hexColor: string): string => {
  const normalized = hexColor.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '#111827'
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness >= 150 ? '#111827' : '#f9fafb'
}

const nextHourWindow = () => {
  const start = new Date()
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    startAt: toDatetimeInput(start.toISOString()),
    endAt: toDatetimeInput(end.toISOString()),
  }
}

const isIgnorableAuthLockError = (message: string): boolean =>
  message.includes('auth-token') && message.includes('stole it')

const extractFirstUrl = (text: string | null): string | null => {
  if (!text) return null
  const match = text.match(/(https?:\/\/[^\s]+)|(www\.[^\s]+)/i)
  if (!match) return null
  const raw = match[0]
  return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`
}

function App() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [hidePastEvents, setHidePastEvents] = useState(true)
  const [form, setForm] = useState<EventForm>({
    id: null,
    title: '',
    startAt: '',
    endAt: '',
    allDay: false,
    countdown: false,
    notes: '',
    color: DEFAULT_COLOR,
  })
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [tripDescription, setTripDescription] = useState('')
  const [tripLinkText, setTripLinkText] = useState('')
  const [dreamTrips, setDreamTrips] = useState<DreamTripItem[]>([])
  const [editingTripId, setEditingTripId] = useState<string | null>(null)
  const [tripTableReady, setTripTableReady] = useState(true)
  const [showTripForm, setShowTripForm] = useState(false)
  const [tripColor, setTripColor] = useState(DEFAULT_TRIP_COLOR)

  const showError = (message: string) => {
    if (isIgnorableAuthLockError(message)) return
    setError(message)
  }

  const loadEvents = useCallback(async () => {
    const withCountdown = await supabase
      .from('events')
      .select('id,title,start_at,end_at,all_day,description,color,countdown')
      .order('start_at', { ascending: true })

    let rows: CalendarEventRow[] | null = withCountdown.data
    let loadError = withCountdown.error

    // Backward compatibility: if countdown column isn't migrated yet, still load existing events.
    if (loadError && loadError.message.toLowerCase().includes('countdown')) {
      const fallback = await supabase
        .from('events')
        .select('id,title,start_at,end_at,all_day,description,color')
        .order('start_at', { ascending: true })
      rows = fallback.data
      loadError = fallback.error
    }

    if (loadError) {
      showError(loadError.message)
      return
    }

    setError('')
    setEvents((rows ?? []).map((row) => ({ ...row, countdown: row.countdown ?? false })))
  }, [])

  const loadDreamTrips = useCallback(async () => {
    const withColor = await supabase
      .from('dream_trips')
      .select('id,description,link_text,color,created_at')
      .order('created_at', { ascending: false })
    let rows: Array<Record<string, unknown>> | null = (withColor.data as Array<Record<string, unknown>> | null) ?? null
    let loadError = withColor.error

    // Backward compatibility if the color column was not added yet.
    if (loadError && loadError.message.toLowerCase().includes('color')) {
      const fallback = await supabase
        .from('dream_trips')
        .select('id,description,link_text,created_at')
        .order('created_at', { ascending: false })
      rows = (fallback.data as Array<Record<string, unknown>> | null) ?? null
      loadError = fallback.error
    }

    if (loadError) {
      // Safe fallback while DB migration is pending: keep app usable.
      if (loadError.message.toLowerCase().includes('dream_trips')) {
        setTripTableReady(false)
        setDreamTrips([])
        return
      }
      showError(loadError.message)
      return
    }

    setTripTableReady(true)
    setDreamTrips(
      (rows ?? []).map((row) => ({
        id: row.id as string,
        description: row.description as string,
        linkText: (row.link_text as string | null) ?? '',
        color: (row.color as string | null) ?? DEFAULT_TRIP_COLOR,
        created_at: row.created_at as string | undefined,
      })),
    )
  }, [])

  useEffect(() => {
    window.setTimeout(() => {
      void loadEvents()
      void loadDreamTrips()
    }, 0)
    const channel = supabase
      .channel('shared-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        void loadEvents()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dream_trips' }, () => {
        void loadDreamTrips()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadDreamTrips, loadEvents])

  const openNew = (startAt = '', endAt = '', allDay = false) => {
    const defaults = nextHourWindow()
    setForm({
      id: null,
      title: '',
      startAt: startAt || defaults.startAt,
      endAt: endAt || defaults.endAt,
      allDay,
      countdown: false,
      notes: '',
      color: DEFAULT_COLOR,
    })
    setError('')
    setShowForm(true)
  }

  const openEdit = (event: CalendarEvent) => {
    setForm({
      id: event.id,
      title: event.title,
      startAt: event.all_day ? toDateInput(event.start_at) : toDatetimeInput(event.start_at),
      endAt: event.end_at
        ? event.all_day
          ? toAllDayEndInput(event)
          : toDatetimeInput(event.end_at)
        : event.all_day
          ? toDateInput(event.start_at)
          : toDatetimeInput(event.start_at),
      allDay: event.all_day,
      countdown: event.countdown,
      notes: event.description ?? '',
      color: event.color ?? DEFAULT_COLOR,
    })
    setError('')
    setShowForm(true)
  }

  const closeForm = () => setShowForm(false)

  const onDateClick = (click: DateClickInfo) => {
    if (click.allDay) {
      openNew(click.dateStr, click.dateStr, true)
      return
    }
    const start = toDatetimeInput(click.dateStr)
    const end = toDatetimeInput(addHours(new Date(click.dateStr).toISOString(), 1))
    openNew(start, end, false)
  }

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    const startIso = toIso(form.startAt, form.allDay)
    let endIso = toIso(form.endAt, form.allDay) || (startIso ? addHours(startIso, 1) : null)
    if (!form.title.trim() || !startIso || !endIso) {
      setSaving(false)
      showError('Title, start, and end are required.')
      return
    }
    if (form.allDay) {
      if (new Date(endIso) < new Date(startIso)) {
        setSaving(false)
        showError('End date cannot be before start date.')
        return
      }
      // Store all-day end as exclusive so same-day events render as a single day in FullCalendar.
      endIso = addDays(endIso, 1)
    } else if (new Date(endIso) <= new Date(startIso)) {
      setSaving(false)
      showError('End must be after start.')
      return
    }

    const payload = {
      title: form.title.trim(),
      start_at: startIso,
      end_at: endIso,
      all_day: form.allDay,
      countdown: form.countdown,
      description: form.notes.trim() || null,
      color: form.color || DEFAULT_COLOR,
    }

    const query = form.id
      ? supabase.from('events').update(payload).eq('id', form.id)
      : supabase.from('events').insert(payload)

    const { error: saveError } = await query
    setSaving(false)

    if (saveError) {
      showError(saveError.message)
      return
    }

    setNotice(form.id ? 'Event updated.' : 'Event created.')
    setShowForm(false)
    await loadEvents()
  }

  const onDelete = async () => {
    if (!form.id) return
    setSaving(true)
    setError('')
    const { error: deleteError } = await supabase.from('events').delete().eq('id', form.id)
    setSaving(false)
    if (deleteError) {
      showError(deleteError.message)
      return
    }
    setNotice('Event deleted.')
    setShowForm(false)
    await loadEvents()
  }

  const calendarEvents: EventInput[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start_at,
    end: event.end_at ?? undefined,
    allDay: event.all_day,
    backgroundColor: event.color ?? DEFAULT_COLOR,
    borderColor: event.color ?? DEFAULT_COLOR,
    extendedProps: {
      notes: event.description ?? '',
    },
  }))

  const sortedEvents = [...events].sort((a, b) => {
    if (a.countdown !== b.countdown) return a.countdown ? -1 : 1

    const aStart = new Date(a.start_at).getTime()
    const bStart = new Date(b.start_at).getTime()
    const aUpcoming = aStart >= nowMs
    const bUpcoming = bStart >= nowMs

    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1

    if (aUpcoming && bUpcoming) return aStart - bStart
    return bStart - aStart
  })
  const filteredEvents = hidePastEvents
    ? sortedEvents.filter((event) => event.countdown || new Date(event.start_at).getTime() >= nowMs)
    : sortedEvents
  const formLink = extractFirstUrl(form.notes)

  const formatSidebarEventDate = (event: CalendarEvent) => {
    const start = new Date(event.start_at)
    if (event.all_day) {
      return start.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    }
    return start.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const formatCountdown = (event: CalendarEvent) => {
    const targetMs = new Date(event.start_at).getTime()
    const diff = targetMs - nowMs
    if (diff <= 0) return 'Started'
    const minutes = Math.floor(diff / 60000)
    const days = Math.floor(minutes / (60 * 24))
    const hours = Math.floor((minutes % (60 * 24)) / 60)
    const mins = minutes % 60
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  const addDreamTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice('')
    setError('')

    if (!tripTableReady) {
      showError('Dream trip board is not ready yet. Run the dream_trips SQL migration first.')
      return
    }

    const description = tripDescription.trim()
    const linkText = tripLinkText.trim()
    if (!description) return

    if (editingTripId) {
      const { error: saveError } = await supabase
        .from('dream_trips')
        .update({ description, link_text: linkText || null, color: tripColor || DEFAULT_TRIP_COLOR })
        .eq('id', editingTripId)

      if (saveError) {
        showError(saveError.message)
        return
      }
      setNotice('Dream trip updated.')
      setEditingTripId(null)
    } else {
      const { error: saveError } = await supabase
        .from('dream_trips')
        .insert({ description, link_text: linkText || null, color: tripColor || DEFAULT_TRIP_COLOR })

      if (saveError) {
        showError(saveError.message)
        return
      }
      setNotice('Dream trip added.')
    }

    setTripDescription('')
    setTripLinkText('')
    setTripColor(DEFAULT_TRIP_COLOR)
    await loadDreamTrips()
  }

  const onEditTrip = (trip: DreamTripItem) => {
    setTripDescription(trip.description)
    setTripLinkText(trip.linkText)
    setTripColor(trip.color || DEFAULT_TRIP_COLOR)
    setEditingTripId(trip.id)
    setShowTripForm(true)
  }

  const onDeleteTrip = async (tripId: string) => {
    if (!tripTableReady) {
      showError('Dream trip board is not ready yet. Run the dream_trips SQL migration first.')
      return
    }
    setNotice('')
    setError('')
    const { error: deleteError } = await supabase.from('dream_trips').delete().eq('id', tripId)
    if (deleteError) {
      showError(deleteError.message)
      return
    }
    if (editingTripId === tripId) {
      setShowTripForm(false)
      setEditingTripId(null)
      setTripDescription('')
      setTripLinkText('')
      setTripColor(DEFAULT_TRIP_COLOR)
    }
    setNotice('Dream trip deleted.')
    await loadDreamTrips()
  }

  return (
    <main className="app-shell">
      <div className="app-content is-authenticated">
        <aside className="side-panel">
          <div className="side-panel-actions">
            <button type="button" onClick={() => openNew()}>
              New event
            </button>
          </div>

          <div className="status-slot">
            {notice ? <p className="status success">{notice}</p> : null}
            {error ? <p className="status error">{error}</p> : null}
          </div>

          <section className="side-event-list">
            <div className="side-list-header">
              <h2>Events</h2>
              <label className="compact-checkbox">
                <input
                  type="checkbox"
                  checked={hidePastEvents}
                  onChange={(event) => setHidePastEvents(event.target.checked)}
                />
                Hide past
              </label>
            </div>
            {filteredEvents.length === 0 ? (
              <p className="side-empty">No events yet.</p>
            ) : (
              <ul>
                {filteredEvents.map((event) => (
                  <li key={event.id}>
                    {(() => {
                      const backgroundColor = event.color ?? '#f9fafb'
                      const textColor = getEventTextColor(backgroundColor)
                      const mutedColor = textColor === '#f9fafb' ? '#e5e7eb' : '#4b5563'
                      const style: CSSProperties = {
                        backgroundColor,
                        borderColor: backgroundColor,
                        color: textColor,
                      }
                      return (
                    <button
                      type="button"
                      className="side-event-item"
                      style={style}
                      onClick={() => openEdit(event)}
                    >
                      <span className="side-event-title">{event.title}</span>
                      <span className="side-event-date" style={{ color: mutedColor }}>
                        {formatSidebarEventDate(event)}
                      </span>
                      {event.countdown ? (
                        <span className="side-event-countdown">Countdown: {formatCountdown(event)}</span>
                      ) : null}
                      {event.description ? (
                        <span className="side-event-notes" style={{ color: mutedColor }}>
                          {event.description}
                        </span>
                      ) : null}
                    </button>
                      )
                    })()}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="side-ads" aria-label="Sponsored">
            <h2>Sponsored</h2>
            <SponsoredSlideshow cards={SPONSORED_AD_CARDS} />
          </section>
        </aside>

        <section className="calendar-shell">
          <div className="calendar-toolbar-mobile">
          <button type="button" onClick={() => openNew()}>
            New event
          </button>
          </div>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            height="100%"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek',
            }}
            dateClick={onDateClick}
            events={calendarEvents}
            eventClick={(click) => {
              const event = events.find((item) => item.id === click.event.id)
              if (event) openEdit(event)
            }}
            eventDidMount={(info) => {
              const notes = info.event.extendedProps.notes as string | undefined
              if (notes) info.el.title = notes
            }}
          />
        </section>

        <aside className="trip-sidebar">
          <div className="side-panel-actions">
            <button
              type="button"
              onClick={() => {
                setShowTripForm(true)
                setEditingTripId(null)
                setTripDescription('')
                setTripLinkText('')
                setTripColor(DEFAULT_TRIP_COLOR)
              }}
            >
              Create new trip idea
            </button>
          </div>

          <section className="side-event-list">
            <h2>Trip Ideas</h2>
            {!tripTableReady ? (
              <p className="side-empty">Run `supabase/dream-trips.sql` to enable cloud dream trips.</p>
            ) : dreamTrips.length === 0 ? (
              <p className="side-empty">No trip ideas yet.</p>
            ) : (
              <ul className="trip-list">
                {dreamTrips.map((trip) => (
                  <li key={trip.id}>
                    <button
                      type="button"
                      className="side-event-item"
                      style={{ backgroundColor: trip.color || DEFAULT_TRIP_COLOR, borderColor: trip.color || DEFAULT_TRIP_COLOR }}
                      onClick={() => onEditTrip(trip)}
                    >
                      <span className="trip-description">{trip.description}</span>
                      {trip.linkText ? <span className="trip-link-text">{trip.linkText}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {showTripForm ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setShowTripForm(false)
            setEditingTripId(null)
            setTripDescription('')
            setTripLinkText('')
            setTripColor(DEFAULT_TRIP_COLOR)
          }}
        >
          <section className="event-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{editingTripId ? 'Edit trip idea' : 'New trip idea'}</h2>
            <form className="trip-form" onSubmit={addDreamTrip}>
              <label htmlFor="trip-description">Place description</label>
              <textarea
                id="trip-description"
                rows={3}
                value={tripDescription}
                onChange={(event) => setTripDescription(event.target.value)}
                placeholder="Santorini in spring, cliffside hotel, sunset views..."
              />
              <label htmlFor="trip-link">Link text (plain text)</label>
              <input
                id="trip-link"
                value={tripLinkText}
                onChange={(event) => setTripLinkText(event.target.value)}
                placeholder="https://example.com/place"
              />
              <label htmlFor="trip-color">Card background color</label>
              <input
                id="trip-color"
                type="color"
                value={tripColor}
                onChange={(event) => setTripColor(event.target.value)}
              />
              <div className="modal-actions">
                <button type="submit">{editingTripId ? 'Update trip' : 'Add trip idea'}</button>
                {editingTripId ? (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      void onDeleteTrip(editingTripId)
                    }}
                  >
                    Delete
                  </button>
                ) : null}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setShowTripForm(false)
                    setEditingTripId(null)
                    setTripDescription('')
                    setTripLinkText('')
                    setTripColor(DEFAULT_TRIP_COLOR)
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {showForm ? (
        <div className="modal-backdrop" onClick={closeForm}>
          <section className="event-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{form.id ? 'Edit event' : 'New event'}</h2>
            <form onSubmit={onSave}>
              <label htmlFor="title">Title</label>
              <input
                id="title"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />

              <div className="grid-two">
                <div>
                  <label htmlFor="start">Start</label>
                  <input
                    id="start"
                    type={form.allDay ? 'date' : 'datetime-local'}
                    value={form.startAt}
                    onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="end">End</label>
                  <input
                    id="end"
                    type={form.allDay ? 'date' : 'datetime-local'}
                    value={form.endAt}
                    onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))}
                    required
                  />
                </div>
              </div>

              <label className="checkbox-row" htmlFor="allDay">
                <input
                  id="allDay"
                  type="checkbox"
                  checked={form.allDay}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setForm((prev) => ({
                      ...prev,
                      allDay: checked,
                      startAt: checked ? prev.startAt.slice(0, 10) : `${prev.startAt.slice(0, 10)}T09:00`,
                      endAt: checked ? prev.endAt.slice(0, 10) : `${prev.endAt.slice(0, 10)}T10:00`,
                    }))
                  }}
                />
                All-day event
              </label>

              <label className="checkbox-row" htmlFor="countdown">
                <input
                  id="countdown"
                  type="checkbox"
                  checked={form.countdown}
                  onChange={(event) => setForm((prev) => ({ ...prev, countdown: event.target.checked }))}
                />
                Countdown
              </label>

              <label htmlFor="notes">Notes (URLs can be plain text)</label>
              <textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
              {formLink ? (
                <button
                  type="button"
                  className="secondary open-link-inline"
                  onClick={() => window.open(formLink, '_blank', 'noopener,noreferrer')}
                >
                  Open link from notes
                </button>
              ) : null}

              <label htmlFor="color">Color</label>
              <input
                id="color"
                type="color"
                value={form.color}
                onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
              />

              <div className="modal-actions">
                <button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                {form.id ? (
                  <button type="button" className="danger" onClick={onDelete} disabled={saving}>
                    Delete
                  </button>
                ) : null}
                <button type="button" className="secondary" onClick={closeForm} disabled={saving}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
