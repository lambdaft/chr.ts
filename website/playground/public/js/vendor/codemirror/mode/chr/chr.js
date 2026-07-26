CodeMirror.defineMode('chr', function (config) {
  var js = CodeMirror.getMode(config, 'javascript')

  return {
    startState: function () {
      return js.startState()
    },
    token: function (stream, state) {
      var ch = stream.peek()

      if (/[a-zA-Z_$]/.test(ch)) {
        if (stream.match(/[a-zA-Z_$][a-zA-Z0-9_$]*\s*\/\s*[0-9]+/, true)) {
          return 'chr-declaration'
        }
      }

      if (ch === '=') {
        if (stream.match(/==>/, true)) {
          return 'chr-propagation'
        }
        if (stream.match(/<=>/, true)) {
          return 'chr-simplification'
        }
      }

      if (ch === '\\' && stream.match(/\\/, true)) {
        return 'chr-simpagation'
      }

      if (ch === '!' && stream.match(/![a-zA-Z_$][a-zA-Z0-9_$]*/, true)) {
        return 'chr-action'
      }

      return js.token(stream, state)
    }
  }
})
