const {objectTypeOf} = require('../utils')

function FirestoreReadNode(config) {
  if (!config.admin) {
    throw "No firebase admin specified";
  }

  if (!config.collection) {
    throw 'FireStore collection Not Present';
  }

  this.firestore = config.admin.firestore
  this.collection = config.collection
  this.document = config.document
  this.realtime = config.realtime
  this.query = config.query
  this.snapListener = null
  // register a realtime listener on node init
  if (this.realtime) this.main({}, config.send.bind(config), config.error.bind(config))
}

FirestoreReadNode.prototype.main = function (msg, send, errorCb) {
  const input = (msg.hasOwnProperty('firestore')) ? msg.firestore : {}

  const col = input.collection || this.collection
  const doc = input.document || this.document
  const rt = input.realtime || this.realtime
  const query = input.query || this.query

  const baseRef = doc ? this.firestore.collection(col).doc(doc) : this.firestore.collection(col)
  const referenceQuery = doc ? baseRef : this.prepareQuery(baseRef, query)

// remove existing one before registering another
  this.unsubscribeListener()

  if (!rt) {
    referenceQuery.get()
        .then((snap) => {
          snapHandler(snap)
        })
        .catch((err) => {
          errorCb(err)
        })
  } else {
    this.snapListener = referenceQuery.onSnapshot((snap) => snapHandler(snap), (error) => errorCb(error))
  }

  function snapHandler(snap) {
    if (!doc) { // get an entire collection
      let docArray = {};
      snap.forEach(function (snapDoc) {
        if (!snapDoc.exists) return;
        docArray[snapDoc.id] = snapDoc.data()
      });
      msg.payload = docArray
    } else {
      msg.payload = snap.data()
    }
    send(msg)
  }
}

FirestoreReadNode.prototype.prepareQuery = function (baseRef, queryObj) {
  queryObj.forEach((condition) => {
    const key = Object.keys(condition)[0]

    let value = condition[key]
    let isString = objectTypeOf(value) === "[object String]"
    let isArray = objectTypeOf(value) === "[object Array]"
    let isObject = objectTypeOf(value) === "[object Object]"

    switch (key) {
      case 'where':
        if (isString) {
          baseRef = baseRef.where(value)
        } else if (isArray) {
          baseRef = baseRef.where(...value)
        } else if (isObject) {
          baseRef = baseRef.where(value.field, value.operation, value.value)
        }
        break;
      case 'orderBy':
        if (isString) {
          baseRef = baseRef.orderBy(value)
        } else if (isArray) {
          baseRef = baseRef.orderBy(...value)
        } else if (isObject) {
          baseRef = !!value.direction ?
              baseRef.orderBy(value.field, value.direction)
              : baseRef.orderBy(value.field)
        }
        break;
      case 'startAt':
      case 'endAt':
      case 'startAfter':
      case 'endBefore':
        baseRef = isArray ? baseRef[key](...value) : baseRef[key](value)
        break;
      case 'limit':
      case 'offset':
        baseRef = baseRef[key](value)
        break;
    }
  })

  return baseRef
}

FirestoreReadNode.prototype.unsubscribeListener = function () {
  if (objectTypeOf(this.snapListener) === "[object Function]") this.snapListener()
}

FirestoreReadNode.prototype.onClose = function (done) {
  this.unsubscribeListener()
  done()
}

module.exports = FirestoreReadNode
