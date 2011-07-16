var xmlParser     = require('node-xml')
  , dateFormatter = require('./date-formatter.js')

var xmlrpcParser = exports

/**
 * Parses an XML-RPC method call.
 *
 * @param {String} xml - the XML string to parse
 * @param {Function} callback - function (error, value) { ... }
 *   - {Object|null} error - any errors that occurred while parsing, otherwise
 *     null
 *   - {Object} method - the method name
 *   - {Array} params - array containing the passed in parameters
 */
xmlrpcParser.parseMethodCall = function(xml, callback) {

  var saxParser = new xmlParser.SaxParser(function(parser) {

    // Parses the method name
    deserializeMethod(parser, function(error, method, parser) {
	  // Ignores whitespace encountered before params
      resetListeners(parser, function() {})

      // Parses the params
      deserializeParams(parser, function (error, params, parser) {
  		callback(error, method, params)
      })
    })
  })

  saxParser.parseString(xml)
}

/**
 * Parses an XML-RPC method response.
 *
 * @param {String} xml - the XML string to parse
 * @param {Function} callback - function (error, value) { ... }
 *   - {Object|null} error - any errors that occurred while parsing, otherwise
 *     null
 *   - {Object} value - value returned in the method response
 */
xmlrpcParser.parseMethodResponse = function(xml, callback) {
	var raw_values = [];
	var stack = [ {
		"name" : "root",
		"values" : [],
		"inner_content": []
	} ];
	var current_raw_value = stack[0];

	var saxParser = new xmlParser.SaxParser(function(cb) {
		cb.onStartDocument(function() {

		});
		cb.onEndDocument(function() {
			callback(false, stack[0]["values"][0]["values"][0][0]);
		});

		cb.onStartElementNS(function(elem, attrs, prefix, uri, namespaces) {
			current_raw_value = {
				'name' : elem,
				'values' : [],
				'inner_content': []
			};
			stack.push(current_raw_value);
		});
		cb.onEndElementNS(function(elem, prefix, uri) {
			var last_element = stack.pop();

			if (last_element.name === 'string') {
				last_element = last_element.inner_content.join('');
			}
			if (last_element.name === 'boolean') {
				last_element = last_element.inner_content.join('') === '1' ? true : false;
			}
			if (last_element.name === 'int' || last_element.name === 'i4') {
				last_element = parseInt(last_element.inner_content.join(''), 10);
			}
			if (last_element.name === 'double') {
				last_element = parseFloat(last_element.inner_content.join(''));
			}			
			if (last_element.name === 'dateTime.iso8601') {
				last_element = dateFormatter.decodeIso8601(last_element.inner_content.join(''));
			}
			
			if (last_element.name === 'array') {
				/*
				 * Because it's always array>data>values[]
				 */
				last_element = last_element.values[0];
			}

			if (last_element.name === 'params') {
				/*
				 * Because it's always params>param[]>value
				 */
				var struct_values = [];
				var struct_elements = last_element.values;
				var struct_elements_length = last_element.values.length;
				for (var i = 0; i < struct_elements_length; i++) {
					var struct_element = struct_elements[i];
					if (struct_element.name === 'param') {
						var struct_member_elements = struct_element.values;
						var struct_member_elements_length = struct_member_elements.length;
						for (var e = 0; e < struct_member_elements_length; e++) {
							var struct_member_element = struct_member_elements[e];
							if (struct_member_element.name === 'value') {
								struct_values.push(struct_member_element.values[0]);
							}
						}
					}
				}
				last_element = struct_values;
			}
			
			if (last_element.name === 'struct') {
				/*
				 * Because it's always: struct>member[]->name and struct>member[]->value
				 */
				var struct_values = {};
				var struct_elements = last_element.values;
				var struct_elements_length = last_element.values.length;
				for (var i = 0; i < struct_elements_length; i++) {
					var struct_element = struct_elements[i];
					if (struct_element.name === 'member') {
						var struct_member_name = null;
						var struct_member_value = null;
						var struct_member_elements = struct_element.values;
						var struct_member_elements_length = struct_member_elements.length;
						for (var e = 0; e < struct_member_elements_length; e++) {
							var struct_member_element = struct_member_elements[e];
							if (struct_member_element.name === 'name') {
								struct_member_name = struct_member_element.inner_content.join('');
							} else if (struct_member_element.name === 'value') {
								struct_member_value = struct_member_element.values[0];
							}
						}
						
						struct_values[struct_member_name] = struct_member_value;
					}
				}
				last_element = struct_values;
			}
			
			if (last_element.name === 'data') {
				/*
				 * Because it's always: data>value[]
				 */
				var struct_values = [];
				var struct_elements = last_element.values;
				var struct_elements_length = last_element.values.length;
				for (var i = 0; i < struct_elements_length; i++) {
					var struct_element = struct_elements[i];
					if (struct_element.name === 'value') {
						struct_values.push(struct_element.values[0]);
					}
				}
				last_element = struct_values;
			}			
			
			stack[stack.length - 1].values.push(last_element);
			current_raw_value = stack[stack.length - 1];
		});
		cb.onCharacters(function(chars) {
			current_raw_value.inner_content.push(chars);
		});
//		cb.onCdata(function(cdata) {
//			 sys.puts('<CDATA>' + cdata + "</CDATA>");
//		});
//		cb.onComment(function(msg) {
//			 sys.puts('<COMMENT>' + msg + "</COMMENT>");
//		});
//		cb.onWarning(function(msg) {
//			 sys.puts('<WARNING>' + msg + "</WARNING>");
//		});
//		cb.onError(function(msg) {
//			 sys.puts('<ERROR>' + JSON.stringify(msg) + "</ERROR>");
//		});
	});

	saxParser.parseString(xml);
};


function resetListeners(parser, startElementListener) {
  // Removes listeners to prevent them from being fired on parsing events when
  // they shouldn't.

  // Ignore any characters encountered between elements. Like newlines and
  // spaces.
  parser.onCharacters(function() {})

  // Make sure the right new element handler is listening
  parser.onStartElementNS(startElementListener)

  // Ignore any end elements encountered, as likely already returned from the
  // element being paid attention to
  parser.onEndElementNS(function() {})
}

function deserializeMethod(parser, callback) {

  parser.onStartElementNS(function(element, attributes, prefix, uri, namespaces) {
    if (element === 'methodName') {
      parser.onCharacters(function(method) {
        callback(null, method, parser)
      })
    }
  })
}

function deserializeParams(parser, callback) {
  var fault = null
  var params = []

  // Returns the array of params when finished
  parser.onEndDocument(function() {
    if (fault !== null) {
      callback(fault, null, parser)
    }
    else {
      callback(null, params, parser)
    }
  })

  parser.onStartElementNS(handleStartElement)

  function handleStartElement(element, attributes, prefix, uri, namespaces) {
    // Parses each param in the message
    if (element === 'param') {
      deserializeParam(parser, function (error, param, parser) {
        // Ignores whitespacing and sets correct new element listener
        resetListeners(parser, handleStartElement)
        params.push(param)
      })
    }
    // If the message response is a fault, parse the error
    else if (element === 'fault') {
      deserializeParam(parser, function (error, value, parser) {
        resetListeners(parser, handleStartElement)
        fault = value
      })
    }
  }
}

function deserializeParam(parser, callback) {

  parser.onStartElementNS(function(element, attributes, prefix, uri, namespaces) {
    // Checks if element is an XML-RPC data type
    var isFlatParam = false
    var flatParams = ['boolean', 'dateTime.iso8601', 'double', 'int', 'i4', 'string', 'nil']
    for (var i = 0; i < flatParams.length && !isFlatParam; i++) {
      if (flatParams[i] === element) {
        isFlatParam = true
      }
    }

    // A non-nested parameter. These simple values can be returned immediately.
    if (isFlatParam) {
      // Coerce the characters into the proper type
      parser.onCharacters(function(chars) {
        var param = null
        switch (element) {
          case 'boolean':
            if (chars === '1') {
              param = true
            }
            else {
              param = false
            }
            break
          case 'dateTime.iso8601':
            param = dateFormatter.decodeIso8601(chars)
            break
          case 'double':
            param = parseFloat(chars)
            break
          case 'i4':
          case 'int':
            param = parseInt(chars)
            break
          case 'string':
            param = chars
            break
        }
        callback(null, param, parser)
      })

      // The On End Element event will only be reached for empty elements (like
      // <string/>), since the On Characters event would have returned
      // otherwise.
      // The appropriate empty value for the element will be returned.
      parser.onEndElementNS(function(element, prefix, uri) {
        var param = null
        switch (element) {
          case 'string':
            param = ''
            break
        }
        callback(null, param, parser)
      })
    }
    // An Array must handle multiple values and possibly nested values too
    else if (element === 'array') {
      deserializeArrayParam(parser, function (error, param) {
        callback(null, param, parser)
      })
    }
    // A Struct must handle multiple values and possibly nested values too
    else if (element === 'struct') {
      deserializeStructParam(parser, function (error, param) {
        callback(null, param, parser)
      })
    }
  })
}

function deserializeArrayParam(parser, callback) {
  var values = []

  parser.onStartElementNS(handleStartElement)

  function handleStartElement(element, attributes, prefix, uri, namespaces) {
    // Parse each element in the array XML (denoted by element 'value') and adds
    // to the array
    if (element === 'value') {
      deserializeParam(parser, function(error, value, parser) {
        // Ignores whitespacing and sets correct new element listener
        resetListeners(parser, handleStartElement)
        values.push(value)

        // If hits the end of this array XML, return the values
        parser.onEndElementNS(function(element, prefix, uri) {
          if (element === 'array') {
            callback(null, values)
          }
        })

      })
    }
  }
}

function deserializeStructParam(parser, callback) {
  var struct = {}
    , name = null

  parser.onStartElementNS(handleStartElement)

  function handleStartElement(element, attributes, prefix, uri, namespaces) {
    // Parse each member in the struct XML (denoted by element 'member') and
    // adds to the object
    if (element === 'name') {
      parser.onCharacters(function(chars) {
        name = chars
      })
    }
    if (element === 'value') {
      deserializeParam(parser, function(error, value, parser) {
        // Ignores whitespacing and sets correct new element listener
        resetListeners(parser, handleStartElement)

        // If hits the end of this struct XML, return the object 
        struct[name] = value
        parser.onEndElementNS(function(element, prefix, uri) {
          if (element === 'struct') {
            callback(null, struct)
          }
        })

      })
    }
  }
}

