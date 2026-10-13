// The two Sentry calls the game uses. Importing them by name leaves out session replay and the feedback form, which
// are most of the library; asking for the whole of '@sentry/browser' would ship all of it.
export { captureException, init } from '@sentry/browser';
