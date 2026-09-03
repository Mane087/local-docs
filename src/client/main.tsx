import { render } from 'preact'
import { App } from './components/App.js'
import './styles/tokens.css'
import './styles/app.css'

const contenedor = document.getElementById('app')
if (contenedor) render(<App />, contenedor)
