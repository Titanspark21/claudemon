import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bold, dim, red } from '../src/ui/ansi.mjs'
import {
  CACHE_CONTROL,
  CONTENT_TYPES,
  DEFAULT_CONTENT_TYPE,
  DEFAULT_OPEN_COMMAND,
  DEFAULT_PORT,
  MAX_PORT,
  MIN_PORT,
  OPEN_COMMANDS,
  PLAIN_TEXT_CONTENT_TYPE,
  PORT_ATTEMPTS,
} from './constants.mjs'

const SITE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs')

const args = process.argv.slice(2)
const wantsBrowser = args.includes('--open')

const requestedPort = (argv) => {
  const flag = argv.indexOf('--port')

  if (flag >= 0) return Number(argv[flag + 1])

  return Number(process.env.PORT ?? DEFAULT_PORT)
}

const port = requestedPort(args)

if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
  console.error(
    `${red('serve-site')} --port wants a number between ${MIN_PORT} and ${MAX_PORT}`,
  )
  process.exit(1)
}

const send = (res, status, body, type = PLAIN_TEXT_CONTENT_TYPE) => {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': CACHE_CONTROL,
  })
  res.end(body)
}

const handleRequest = async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost')

  let target = decodeURIComponent(pathname)
  let filePath = join(SITE_DIR, normalize(target))

  if (filePath !== SITE_DIR && !filePath.startsWith(SITE_DIR + '/')) {
    console.log(dim(`  403 ${target}`))

    return send(res, 403, 'Forbidden\n')
  }

  let info = await stat(filePath).catch(() => null)

  if (info?.isDirectory()) {
    if (!target.endsWith('/')) {
      res.writeHead(301, { location: target + '/' })
      console.log(dim(`  301 ${target}`))

      return res.end()
    }

    filePath = join(filePath, 'index.html')
    target += 'index.html'
    info = await stat(filePath).catch(() => null)
  }

  if (!info?.isFile()) {
    console.log(dim(`  404 ${target}`))

    return send(res, 404, `Not found: ${target}\n`)
  }

  res.writeHead(200, {
    'content-type':
      CONTENT_TYPES[extname(filePath).toLowerCase()] ?? DEFAULT_CONTENT_TYPE,
    'content-length': info.size,
    'cache-control': CACHE_CONTROL,
  })

  console.log(dim(`  200 ${target}`))
  createReadStream(filePath).pipe(res)
}

const openCommand = () => {
  return OPEN_COMMANDS[process.platform] ?? DEFAULT_OPEN_COMMAND
}

const open = (url) => {
  spawn(openCommand(), [url], { stdio: 'ignore', detached: true }).unref()
}

const server = createServer(handleRequest)

const handleListening = () => {
  const url = `http://localhost:${server.address().port}/`

  console.log(`${bold('claudemon')} landing at ${bold(url)}`)
  console.log(dim(`  serving ${SITE_DIR}`))
  console.log(dim('  ctrl-c to stop\n'))

  if (wantsBrowser) open(url)
}

server.on('listening', handleListening)

const listenErrorHandler = (attempt) => {
  return (error) => {
    if (error.code === 'EADDRINUSE' && attempt < PORT_ATTEMPTS - 1) {
      console.log(
        dim(`  ${port + attempt} is taken, trying ${port + attempt + 1}`),
      )
      listen(attempt + 1)

      return
    }

    console.error(`${red('serve-site')} ${error.message}`)
    process.exit(1)
  }
}

const listen = (attempt) => {
  server.once('error', listenErrorHandler(attempt))

  server.listen(port + attempt)
}

listen(0)
