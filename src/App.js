import Axios from 'axios'

import Cookies from 'universal-cookie'
import React, { useState, useEffect, useRef } from 'react'

import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect,
} from 'react-router-dom'
import styled, { ThemeProvider } from 'styled-components'

import AccountSetup from './UI/AccountSetup'
import AppHeader from './UI/AppHeader'

import { check, CanUser } from './UI/CanUser'
import rules from './UI/rbac-rules'

import Contact from './UI/Contact'
import Contacts from './UI/Contacts'
import Credential from './UI/Credential'
import Credentials from './UI/Credentials'
import ForgotPassword from './UI/ForgotPassword'
import FullPageSpinner from './UI/FullPageSpinner'
import Home from './UI/Home'
import Login from './UI/Login'
import {
  useNotification,
  NotificationProvider,
} from './UI/NotificationProvider'
import PasswordReset from './UI/PasswordReset'
import Settings from './UI/Settings'
import User from './UI/User'
import Users from './UI/Users'

import SessionProvider from './UI/SessionProvider'

import './App.css'

const Frame = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
`
const Main = styled.main`
  flex: 9;
  padding: 30px;
`

function App() {
  const defaultTheme = {
    primary_color: '#0E6EC4',
    secondary_color: '#FFA21A',
    neutral_color: '#091C40',
    negative_color: '#ed003c',
    warning_color: '#e49b13',
    positive_color: '#008a00',
    text_color: '#555',
    text_light: '#fff',
    border: '#e3e3e3',
    drop_shadow: '3px 3px 3px rgba(0, 0, 0, 0.3)',
    background_primary: '#fff',
    background_secondary: '#f5f5f5',
  }

  const cookies = new Cookies()

  // Keep track of loading processes
  let loadingArray = []

  const setNotification = useNotification()

  // Websocket reference hook
  const controllerSocket = useRef()

  // Used for websocket auto reconnect
  const [websocket, setWebsocket] = useState(false)

  // State governs whether the app should be loaded. Depends on the loadingArray
  const [appIsLoaded, setAppIsLoaded] = useState(false)

  // Check for local state copy of theme, otherwise use default hard coded here in App.js
  const localTheme = JSON.parse(localStorage.getItem('recentTheme'))
  const [theme, setTheme] = useState(localTheme ? localTheme : defaultTheme)

  // Styles to change array
  const [stylesArray, setStylesArray] = useState([])

  // Message states
  const [contacts, setContacts] = useState([])
  const [credentials, setCredentials] = useState([])
  const [image, setImage] = useState()
  const [roles, setRoles] = useState([])
  const [users, setUsers] = useState([])
  const [user, setUser] = useState({})
  const [errorMessage, setErrorMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [organizationName, setOrganizationName] = useState(null)

  // session states
  const [session, setSession] = useState('')
  const [loggedInUserId, setLoggedInUserId] = useState('')
  const [loggedInUserState, setLoggedInUserState] = useState(null)
  const [loggedInUsername, setLoggedInUsername] = useState('')
  const [loggedInRoles, setLoggedInRoles] = useState([])
  const [loggedIn, setLoggedIn] = useState(false)
  const [sessionTimer, setSessionTimer] = useState(60)

  const [QRCodeURL, setQRCodeURL] = useState('')
  const [focusedConnectionID, setFocusedConnectionID] = useState('')

  // (JamesKEbert) Note: We may want to abstract the websockets out into a high-order component for better abstraction, especially potentially with authentication/authorization

  // Perform First Time Setup. Connect to Controller Server via Websockets

  // Setting up websocket and controllerSocket
  useEffect(() => {
    if (session && loggedIn && websocket) {
      let url = new URL('/api/ws', window.location.href)
      url.protocol = url.protocol.replace('http', 'ws')
      controllerSocket.current = new WebSocket(url.href)
      setWebsocket(true)
    }
  }, [loggedIn, session, websocket])

  // TODO: Setting logged-in user and session states on app mount
  useEffect(() => {
    console.log('refreshed')

    Axios({
      method: 'GET',
      url: '/api/session',
    }).then((res) => {
      console.log(res)
      if (res.status) {
        // Check for a session and then set up the session state based on what we found
        setSession(cookies.get('sessionId'))

        if (cookies.get('sessionId')) {
          setLoggedIn(true)
          setWebsocket(true)

          if (cookies.get('user')) {
            const userCookie = cookies.get('user')
            setLoggedInUserState(userCookie)
            setLoggedInUserId(userCookie.id)
            setLoggedInUsername(userCookie.username)
            console.log(userCookie.roles)
            setLoggedInRoles(userCookie.roles)
          } else setAppIsLoaded(true)
        } else setAppIsLoaded(true)
      }
    })
  }, [loggedIn])

  // Define Websocket event listeners
  useEffect(() => {
    // Perform operation on websocket open
    // Run web sockets only if authenticated
    if (session && loggedIn && websocket) {
      controllerSocket.current.onopen = () => {
        // Resetting state to false to allow spinner while waiting for messages
        setAppIsLoaded(false) // This doesn't work as expected. See function removeLoadingProcess

        // Wait for the roles for come back to start sending messages
        console.log('Ready to send messages')

        sendMessage('SETTINGS', 'GET_THEME', {})
        addLoadingProcess('THEME')

        if (
          check(rules, loggedInUserState, 'contacts:read', 'demographics:read')
        ) {
          sendMessage('CONTACTS', 'GET_ALL', {
            additional_tables: ['Demographic', 'Passport'],
          })
          addLoadingProcess('CONTACTS')
        }

        if (check(rules, loggedInUserState, 'credentials:read')) {
          sendMessage('CREDENTIALS', 'GET_ALL', {})
          addLoadingProcess('CREDENTIALS')
        }

        if (check(rules, loggedInUserState, 'roles:read')) {
          sendMessage('ROLES', 'GET_ALL', {})
          addLoadingProcess('ROLES')
        }

        sendMessage('SETTINGS', 'GET_ORGANIZATION_NAME', {})
        addLoadingProcess('ORGANIZATION')

        sendMessage('IMAGES', 'GET_ALL', {})
        addLoadingProcess('LOGO')

        // This is the example of atuthorizing websockets
        if (check(rules, loggedInUserState, 'users:read')) {
          sendMessage('USERS', 'GET_ALL', {})
          addLoadingProcess('USERS')
        }
      }

      controllerSocket.current.onclose = (event) => {
        // Auto Reopen websocket connection
        // (JamesKEbert) TODO: Converse on sessions, session timeout and associated UI

        setLoggedIn(false)
        setWebsocket(!websocket)
      }

      // Error Handler
      controllerSocket.current.onerror = (event) => {
        setNotification('Client Error - Websockets', 'error')
      }

      // Receive new message from Controller Server
      controllerSocket.current.onmessage = (message) => {
        const parsedMessage = JSON.parse(message.data)

        messageHandler(
          parsedMessage.context,
          parsedMessage.type,
          parsedMessage.data
        )
      }
    }
  }, [session, loggedIn, users, user, websocket, image, loggedInUserState]) // (Simon) We have to listen to all 7 to for the app to function properly

  // Send a message to the Controller server
  function sendMessage(context, type, data = {}) {
    controllerSocket.current.send(JSON.stringify({ context, type, data }))
  }

  // Handle inbound messages
  const messageHandler = async (context, type, data = {}) => {
    try {
      console.log(
        `New Message with context: '${context}' and type: '${type}' with data:`,
        data
      )
      switch (context) {
        case 'ERROR':
          switch (type) {
            case 'SERVER_ERROR':
              setNotification(
                `Server Error - ${data.errorCode} \n Reason: '${data.errorReason}'`,
                'error'
              )
              break

            default:
              setNotification(
                `Error - Unrecognized Websocket Message Type: ${type}`,
                'error'
              )
              break
          }
          break

        case 'INVITATIONS':
          switch (type) {
            case 'INVITATION':
              setQRCodeURL(data.invitation_record.invitation_url)
              break

            case 'SINGLE_USE_USED':
              if (data.workflow === 'test_id') {
                // (mikekebert) Reset the QR code URL (which also closes the QR code modal)
                setQRCodeURL('')
                // (mikekebert) Set the connection_id so we can issue a credential to a particular connection
                setFocusedConnectionID(data.connection_id)
              } else {
                // (mikekebert) Reset the QR code URL (which also closes the QR code modal)
                setQRCodeURL('')
              }
              break

            case 'INVITATIONS_ERROR':
              console.log(data.error)
              console.log('Invitations Error')
              setErrorMessage(data.error)

              break

            default:
              setNotification(
                `Error - Unrecognized Websocket Message Type: ${type}`,
                'error'
              )
              break
          }
          break

        case 'CONTACTS':
          switch (type) {
            case 'CONTACTS':
              let updatedContacts = data.contacts

              // (mikekebert) Sort the array by data created, newest on top
              updatedContacts.sort((a, b) =>
                a.created_at < b.created_at ? 1 : -1
              )

              setContacts(updatedContacts)
              removeLoadingProcess('CONTACTS')
              break

            case 'CONTACTS_ERROR':
              console.log(data.error)
              console.log('Contacts Error')
              setErrorMessage(data.error)

              break

            default:
              setNotification(
                `Error - Unrecognized Websocket Message Type: ${type}`,
                'error'
              )
              break
          }
          break

        case 'DEMOGRAPHICS':
          switch (type) {
            case 'DEMOGRAPHICS_ERROR':
              console.log(data.error)
              console.log('Demographics Error')
              setErrorMessage(data.error)

              break

            case 'CONTACTS_ERROR':
              console.log(data.error)
              console.log('CONTACTS ERROR')
              setErrorMessage(data.error)

              break

            default:
              setNotification(
                `Error - Unrecognized Websocket Message Type: ${type}`,
                'error'
              )
              break
          }
          break

        case 'ROLES':
          switch (type) {
            case 'ROLES':
              let oldRoles = roles
              let newRoles = data.roles
              let updatedRoles = []
              // (mikekebert) Loop through the new roles and check them against the existing array
              newRoles.forEach((newRole) => {
                oldRoles.forEach((oldRole, index) => {
                  if (
                    oldRole !== null &&
                    newRole !== null &&
                    oldRole.role_id === newRole.role_id
                  ) {
                    // (mikekebert) If you find a match, delete the old copy from the old array
                    oldRoles.splice(index, 1)
                  }
                })
                updatedRoles.push(newRole)
              })
              // (mikekebert) When you reach the end of the list of new roles, simply add any remaining old roles to the new array
              if (oldRoles.length > 0)
                updatedRoles = [...updatedRoles, ...oldRoles]

              setRoles(updatedRoles)
              removeLoadingProcess('ROLES')
              break

            default:
              setNotification(
                `Error - Unrecognized Websocket Message Type: ${type}`,
                'error'
              )
              break
          }
          break

        case 'USERS':
          switch (type) {
            case 'USERS':
              let oldUsers = users
              let newUsers = data.users
              let updatedUsers = []
              // (mikekebert) Loop through the new users and check them against the existing array
              newUsers.forEach((newUser) => {
                oldUsers.forEach((oldUser, index) => {
                  if (
                    oldUser !== null &&
                    newUser !== null &&
                    oldUser.user_id === newUser.user_id
                  ) {
                    // (mikekebert) If you find a match, delete the old copy from the old array
                    oldUsers.splice(index, 1)
                  }
                })
                updatedUsers.push(newUser)
              })
              // (mikekebert) When you reach the end of the list of new users, simply add any remaining old users to the new array
              if (oldUsers.length > 0)
                updatedUsers = [...updatedUsers, ...oldUsers]
              // (mikekebert) Sort the array by data created, newest on top
              updatedUsers.sort((a, b) =>
                a.created_at < b.created_at ? 1 : -1
              )

              setUsers(updatedUsers)
              removeLoadingProcess('USERS')

              break

            case 'USER':
              let user = data.user[0]
              setUser(user)
              break

            case 'USER_UPDATED':
              setUsers(
                users.map((x) =>
                  x.user_id === data.updatedUser.user_id ? data.updatedUser : x
                )
              )
              setUser(data.updatedUser)
              break

            case 'PASSWORD_UPDATED':
              // (Simon) Replace the user with the updated user based on password)
              console.log('PASSWORD UPDATED')
              setUsers(
                users.map((x) =>
                  x.user_id === data.updatedUserPassword.user_id
                    ? data.updatedUserPassword
                    : x
                )
              )
              break

            case 'USER_CREATED':
              let newUser = data.user[0]
              let oldUsers2 = users
              oldUsers2.push(newUser)
              setUsers(oldUsers2)
              setUser(data.user[0])
              break

            case 'USER_DELETED':
              console.log('USER DELETED')
              const index = users.findIndex((v) => v.user_id === data)
              let alteredUsers = [...users]
              alteredUsers.splice(index, 1)
              setUsers(alteredUsers)

              break

            case 'USER_ERROR':
              console.log('User Error', data.error)

              setErrorMessage(data.error)

              break

            case 'USER_SUCCESS':
              console.log('USER SUCCESS')
              setSuccessMessage(data)

              break

            default:
              setNotification(
                `Error - Unrecognized Websocket Message Type: ${type}`,
                'error'
              )
              break
          }
          break

        case 'CREDENTIALS':
          switch (type) {
            case 'CREDENTIALS':
              let oldCredentials = credentials
              let newCredentials = data.credential_records
              let updatedCredentials = []
              // (mikekebert) Loop through the new credentials and check them against the existing array
              newCredentials.forEach((newCredential) => {
                oldCredentials.forEach((oldCredential, index) => {
                  if (
                    oldCredential !== null &&
                    newCredential !== null &&
                    oldCredential.credential_exchange_id ===
                      newCredential.credential_exchange_id
                  ) {
                    // (mikekebert) If you find a match, delete the old copy from the old array
                    oldCredentials.splice(index, 1)
                  }
                })
                updatedCredentials.push(newCredential)
                // (mikekebert) We also want to make sure to reset any pending connection IDs so the modal windows don't pop up automatically
                if (newCredential.connection_id === focusedConnectionID) {
                  setFocusedConnectionID('')
                }
              })
              // (mikekebert) When you reach the end of the list of new credentials, simply add any remaining old credentials to the new array
              if (oldCredentials.length > 0)
                updatedCredentials = [...updatedCredentials, ...oldCredentials]
              // (mikekebert) Sort the array by data created, newest on top
              updatedCredentials.sort((a, b) =>
                a.created_at < b.created_at ? 1 : -1
              )

              setCredentials(updatedCredentials)
              removeLoadingProcess('CREDENTIALS')
              break

            case 'CREDENTIALS_ERROR':
              console.log('Credentials Error:', data.error)

              setErrorMessage(data.error)
              break

            default:
              setNotification(
                `Error - Unrecognized Websocket Message Type: ${type}`,
                'error'
              )
              break
          }

          break
        case 'PRESENTATIONS':
          switch (type) {
            case 'VERIFIED':
              setNotification('Success - Verified Credential', 'notice')

              break

            default:
              setNotification(
                `Error - Unrecognized Websocket Message Type: ${type}`,
                'error'
              )
              break
          }

          break

        case 'SETTINGS':
          switch (type) {
            case 'SETTINGS_THEME':
              // Writing the recent theme to a local storage
              const stringMessageTheme = JSON.stringify(data.value)
              window.localStorage.setItem('recentTheme', stringMessageTheme)
              setTheme(data.value)
              removeLoadingProcess('THEME')
              break

            case 'LOGO':
              setImage(data)
              removeLoadingProcess('LOGO')
              break

            case 'SETTINGS_ORGANIZATION':
              setOrganizationName(data.companyName)
              removeLoadingProcess('ORGANIZATION')
              break

            case 'SETTINGS_ERROR':
              console.log('Settings Error:', data.error)

              setErrorMessage(data.error)
              break

            case 'SETTINGS_SUCCESS':
              setSuccessMessage(data)
              break

            default:
              setNotification(
                `Error - Unrecognized Websocket Message Type: ${type}`,
                'error'
              )
              break
          }
          break

        case 'IMAGES':
          switch (type) {
            case 'IMAGE_LIST':
              setImage(data)

              removeLoadingProcess('IMAGES')
              break

            case 'IMAGES_ERROR':
              console.log('Images Error:', data.error)
              setErrorMessage(data.error)
              break

            default:
              setNotification(
                `Error - Unrecognized Websocket Message Type: ${type}`,
                'error'
              )
              break
          }
          break

        case 'ORGANIZATION':
          switch (type) {
            case 'ORGANIZATION_NAME':
              setOrganizationName(data[0].value.name)

              removeLoadingProcess('ORGANIZATION')
              break

            default:
              setNotification(
                `Error - Unrecognized Websocket Message Type: ${type}`,
                'error'
              )
              break
          }
          break

        default:
          setNotification(
            `Error - Unrecognized Websocket Message Type: ${context}`,
            'error'
          )
          break
      }
    } catch (error) {
      console.log('Error caught:', error)
      setNotification('Client Error - Websockets', 'error')
    }
  }

  function addLoadingProcess(process) {
    loadingArray.push(process)
  }

  function removeLoadingProcess(process) {
    const index = loadingArray.indexOf(process)

    if (index > -1) {
      loadingArray.splice(index, 1)
    }

    if (loadingArray.length === 0) {
      setAppIsLoaded(true)
    }
  }

  function setUpUser(id, username, roles) {
    setSession(cookies.get('sessionId'))
    setLoggedInUserId(id)
    setLoggedInUsername(username)
    setLoggedInRoles(roles)
  }

  // Update theme state locally
  const updateTheme = (update) => {
    return setTheme({ ...theme, ...update })
  }

  // Update theme in the database
  const saveTheme = () => {
    sendMessage('SETTINGS', 'SET_THEME', theme)
  }

  const addStylesToArray = (key) => {
    let position = stylesArray.indexOf(key)
    // if cannot find indexOf style
    if (!~position) {
      setStylesArray((oldArray) => [...oldArray, `${key}`])
    }
  }

  const removeStylesFromArray = (undoKey) => {
    // Removing a style from an array of styles
    let index = stylesArray.indexOf(undoKey)
    if (index > -1) {
      stylesArray.splice(index, 1)
      setStylesArray(stylesArray)
    }
  }

  // Undo theme change
  const undoStyle = (undoKey) => {
    if (undoKey !== undefined) {
      for (let key in defaultTheme)
        if ((key = undoKey)) {
          const undo = { [`${key}`]: defaultTheme[key] }
          return setTheme({ ...theme, ...undo })
        }
    }
  }

  // Resetting state of error and success messages
  const clearResponseState = () => {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleLogout = (history) => {
    setLoggedIn(false)
    cookies.remove('sessionId')
    cookies.remove('user')

    if (history !== undefined) {
      history.push('/login')
    }
  }

  if ((loggedIn && !appIsLoaded) || (!loggedIn && !appIsLoaded)) {
    // Show the spinner while the app is loading
    return (
      <ThemeProvider theme={theme}>
        <FullPageSpinner />
      </ThemeProvider>
    )
  } else if (!loggedIn && appIsLoaded) {
    return (
      <ThemeProvider theme={theme}>
        <NotificationProvider>
          <Router>
            <Switch>
              <Route
                path="/forgot-password"
                render={({ match, history }) => {
                  return (
                    <Frame id="app-frame">
                      <Main>
                        <ForgotPassword
                          logo={image}
                          history={history}
                          sendRequest={sendMessage}
                          user={user}
                          users={users}
                        />
                      </Main>
                    </Frame>
                  )
                }}
              />
              <Route
                path="/password-reset"
                render={({ match, history }) => {
                  return (
                    <Frame id="app-frame">
                      <Main>
                        <PasswordReset
                          logo={image}
                          history={history}
                          sendRequest={sendMessage}
                          user={user}
                          users={users}
                        />
                      </Main>
                    </Frame>
                  )
                }}
              />
              <Route
                path="/account-setup"
                render={({ match, history }) => {
                  return (
                    <Frame id="app-frame">
                      <Main>
                        <AccountSetup
                          logo={image}
                          history={history}
                          sendRequest={sendMessage}
                          messageHandler={messageHandler}
                          user={user}
                          users={users}
                        />
                      </Main>
                    </Frame>
                  )
                }}
              />
              <Route
                path="/login"
                render={({ match, history }) => {
                  return (
                    <Frame id="app-frame">
                      <Main>
                        <Login
                          logo={image}
                          history={history}
                          setUpUser={setUpUser}
                          sendRequest={sendMessage}
                          setLoggedIn={setLoggedIn}
                        />
                      </Main>
                    </Frame>
                  )
                }}
              />
              <Route path="/">
                <Redirect to="/login" />
              </Route>
            </Switch>
          </Router>
        </NotificationProvider>
      </ThemeProvider>
    )
  } else {
    // loggedIn and appIsLoaded
    return (
      <ThemeProvider theme={theme}>
        <NotificationProvider>
          <SessionProvider logout={handleLogout} sessionTimer={sessionTimer}>
            <Router>
              <Switch>
                <Route exact path="/forgot-password">
                  <Redirect to="/" />
                </Route>
                <Route exact path="/password-reset">
                  <Redirect to="/" />
                </Route>
                <Route exact path="/account-setup">
                  <Redirect to="/" />
                </Route>
                <Route exact path="/login">
                  <Redirect to="/" />
                </Route>
                <Route
                  path="/"
                  exact
                  render={({ match, history }) => {
                    return (
                      <Frame id="app-frame">
                        <AppHeader
                          loggedInUserState={loggedInUserState}
                          logo={image}
                          organizationName={organizationName}
                          loggedInUsername={loggedInUsername}
                          match={match}
                          history={history}
                          handleLogout={handleLogout}
                        />
                        <Main>
                          <Home
                            loggedInUserState={loggedInUserState}
                            sendRequest={sendMessage}
                            QRCodeURL={QRCodeURL}
                            focusedConnectionID={focusedConnectionID}
                          />
                        </Main>
                      </Frame>
                    )
                  }}
                />
                <Route
                  path="/invitations"
                  render={({ match, history }) => {
                    return (
                      <Frame id="app-frame">
                        <AppHeader
                          loggedInUserState={loggedInUserState}
                          loggedInUsername={loggedInUsername}
                          logo={image}
                          organizationName={organizationName}
                          match={match}
                          history={history}
                          handleLogout={handleLogout}
                        />
                        <Main>
                          <p>Invitations</p>
                        </Main>
                      </Frame>
                    )
                  }}
                />
                <Route
                  path="/contacts"
                  exact
                  render={({ match, history }) => {
                    return (
                      <Frame id="app-frame">
                        <AppHeader
                          loggedInUserState={loggedInUserState}
                          loggedInUsername={loggedInUsername}
                          logo={image}
                          organizationName={organizationName}
                          match={match}
                          history={history}
                          handleLogout={handleLogout}
                        />
                        <Main>
                          <Contacts
                            loggedInUserState={loggedInUserState}
                            history={history}
                            sendRequest={sendMessage}
                            contacts={contacts}
                            QRCodeURL={QRCodeURL}
                            focusedConnectionID={focusedConnectionID}
                          />
                        </Main>
                      </Frame>
                    )
                  }}
                />
                <Route
                  path={`/contacts/:contactId`}
                  render={({ match, history }) => {
                    return (
                      <Frame id="app-frame">
                        <AppHeader
                          loggedInUserState={loggedInUserState}
                          loggedInUsername={loggedInUsername}
                          logo={image}
                          organizationName={organizationName}
                          match={match}
                          history={history}
                          handleLogout={handleLogout}
                        />
                        <Main>
                          <Contact
                            loggedInUserState={loggedInUserState}
                            history={history}
                            sendRequest={sendMessage}
                            contactId={match.params.contactId}
                            contacts={contacts}
                            credentials={credentials}
                          />
                        </Main>
                      </Frame>
                    )
                  }}
                />
                <Route
                  path="/credentials"
                  exact
                  render={({ match, history }) => {
                    return (
                      <Frame id="app-frame">
                        <AppHeader
                          loggedInUserState={loggedInUserState}
                          loggedInUsername={loggedInUsername}
                          logo={image}
                          organizationName={organizationName}
                          match={match}
                          history={history}
                          handleLogout={handleLogout}
                        />
                        <Main>
                          <Credentials
                            history={history}
                            credentials={credentials}
                          />
                        </Main>
                      </Frame>
                    )
                  }}
                />
                <Route
                  path={`/credentials/:credentialId`}
                  render={({ match, history }) => {
                    return (
                      <Frame id="app-frame">
                        <AppHeader
                          loggedInUserState={loggedInUserState}
                          loggedInUsername={loggedInUsername}
                          logo={image}
                          organizationName={organizationName}
                          match={match}
                        />
                        <Main>
                          <Credential
                            history={history}
                            credential={match.params.credentialId}
                            credentials={credentials}
                          />
                        </Main>
                      </Frame>
                    )
                  }}
                  credentials={credentials}
                />
                <Route
                  path="/verification"
                  render={({ match, history }) => {
                    return (
                      <Frame id="app-frame">
                        <AppHeader
                          loggedInUserState={loggedInUserState}
                          loggedInUsername={loggedInUsername}
                          logo={image}
                          organizationName={organizationName}
                          match={match}
                          history={history}
                          handleLogout={handleLogout}
                        />
                        <Main>
                          <p>Verification</p>
                        </Main>
                      </Frame>
                    )
                  }}
                />
                <Route
                  path="/messages"
                  render={({ match, history }) => {
                    return (
                      <Frame id="app-frame">
                        <AppHeader
                          loggedInUserState={loggedInUserState}
                          loggedInUsername={loggedInUsername}
                          logo={image}
                          organizationName={organizationName}
                          match={match}
                          history={history}
                          handleLogout={handleLogout}
                        />
                        <Main>
                          <p>Messages</p>
                        </Main>
                      </Frame>
                    )
                  }}
                />
                <Route
                  path="/users"
                  render={({ match, history }) => {
                    return (
                      <Frame id="app-frame">
                        <AppHeader
                          loggedInUserState={loggedInUserState}
                          loggedInUsername={loggedInUsername}
                          logo={image}
                          organizationName={organizationName}
                          match={match}
                          history={history}
                          handleLogout={handleLogout}
                        />
                        <Main>
                          <Users
                            loggedInUserState={loggedInUserState}
                            roles={roles}
                            users={users}
                            user={user}
                            successMessage={successMessage}
                            errorMessage={errorMessage}
                            clearResponseState={clearResponseState}
                            sendRequest={sendMessage}
                          />
                        </Main>
                      </Frame>
                    )
                  }}
                />
                <Route
                  path={`/users/:userId`}
                  render={({ match, history }) => {
                    return (
                      <Frame id="app-frame">
                        <AppHeader
                          loggedInUserState={loggedInUserState}
                          loggedInUsername={loggedInUsername}
                          logo={image}
                          organizationName={organizationName}
                          match={match}
                        />
                        <Main>
                          <User
                            logo={image}
                            organizationName={organizationName}
                            history={history}
                          />
                        </Main>
                      </Frame>
                    )
                  }}
                />
                <Route
                  path="/settings"
                  render={({ match, history }) => {
                    return (
                      <Frame id="app-frame">
                        <AppHeader
                          loggedInUserState={loggedInUserState}
                          loggedInUsername={loggedInUsername}
                          logo={image}
                          organizationName={organizationName}
                          match={match}
                          history={history}
                          handleLogout={handleLogout}
                        />
                        <Main>
                          <Settings
                            updateTheme={updateTheme}
                            saveTheme={saveTheme}
                            undoStyle={undoStyle}
                            errorMessage={errorMessage}
                            successMessage={successMessage}
                            clearResponseState={clearResponseState}
                            imageResponse={image}
                            stylesArray={stylesArray}
                            addStylesToArray={addStylesToArray}
                            removeStylesFromArray={removeStylesFromArray}
                            sendRequest={sendMessage}
                          />
                        </Main>
                      </Frame>
                    )
                  }}
                />
                {/* Redirect to root if no route match is found */}
                <Route render={() => <Redirect to="/" />} />
              </Switch>
            </Router>
          </SessionProvider>
        </NotificationProvider>
      </ThemeProvider>
    )
  }
}

export default App
