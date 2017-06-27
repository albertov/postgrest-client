import {encode} from 'querystring';

const contentRangeStructure = /^(\d+)-(\d+)\/(\d+)$/

const hasOwnProperty = Object.prototype.hasOwnProperty;

function isEmpty(obj) {
  for (var key in obj) {
    if (hasOwnProperty.call(obj, key)) return false;
  }
  return true;
}

/**
 * A request building object which contains convenience methods for
 * communicating with a PostgREST server.
 *
 * @class
 * @param {string} The HTTP method of the request.
 * @param {string} The path to the request.
 */

class ApiRequest {
  constructor (method, path) {
    this.method = method;
    this.path = path;
    this.headers = new Headers();
    this._queryParts = [];
    this._query = {};
    this._single = false
  }

  set (key, value) {
    this.headers.append(key, value);
    return this
  }

  query(params) {
    if (typeof params == "string") {
      this._queryParts.push(params);
    } else {
      this._query = Object.assign(this._query, params);
    }
    return this
  }

  /**
   * Set auth with a bearer token.
   *
   * @param {string|object} The bearer token
   * @returns {ApiRequest} The API request object.
   */

  auth (token) {
    this.set('Authorization', `Bearer ${token}`)
    return this
  }

  /**
   * Takes a query object and translates it to a PostgREST filter query string.
   * All values are prefixed with `eq.`.
   *
   * @param {object} The object to match against.
   * @returns {ApiRequest} The API request object.
   */

  match (query) {
    const newQuery = {}
    Object.keys(query).forEach(key => newQuery[key] = `eq.${query[key]}`)
    return this.query(newQuery)
  }

  /**
   * Cleans up a select string by stripping all whitespace. Then the string is
   * set as a query string value. Also always forces a root @id column.
   *
   * @param {string} The unformatted select string.
   * @returns {ApiRequest} The API request object.
   */

  select (select) {
    if (select) {
      this.query({ select: select.replace(/\s/g, '') })
    }

    return this
  }

  /**
   * Tells PostgREST in what order the result should be returned.
   *
   * @param {string} The property name to order by.
   * @param {bool} True for descending results, false by default.
   * @param {bool} True for nulls first, false by default.
   * @returns {ApiRequest} The API request object.
   */

  order (property, ascending = false, nullsFirst = false) {
    this.query(`order=${property}.${ascending ? 'asc' : 'desc'}.${nullsFirst ? 'nullsfirst' : 'nullslast'}`)
    return this
  }

  /**
   * Specify a range of items for PostgREST to return. If the second value is
   * not defined, the rest of the collection will be sent back.
   *
   * @param {number} The first object to select.
   * @param {number|void} The last object to select.
   * @returns {ApiRequest} The API request object.
   */

  range (from, to) {
    this.set('Range-Unit', 'items')
    this.set('Range', `${from || 0}-${to || ''}`)
    return this
  }

  /**
   * Sets the header which signifies to PostgREST the response must be a single
   * object or 404.
   *
   * @returns {ApiRequest} The API request object.
   */

  single () {
    this._single = true;
    return this
  }

  /**
   * Sends the request and returns a promise. The super class uses the errback
   * pattern, but this function overrides that preference to use a promise.
   *
   * @returns {Promise} Resolves when the request has completed.
   */

  end () {
    let url = this.path
    const hasQueryParts = this._queryParts.length > 0
    const hasQuery = !isEmpty(this._query)
    if (hasQueryParts) {
      url += '?' + this._queryParts.join('&')
    }
    if (hasQuery) {
      url += (hasQueryParts?'&':'?') + encode(this._query)
    }
    if (this._single) {
      this.set('Accept', 'application/vnd.pgrst.object+json')
    } else {
      this.set('Accept', 'application/json')
    }
    const opts = { method: this.method , headers: this.headers }
    return fetch(url, opts).then((resp) => {
      const contentRange = resp.headers.get('content-range');
      return resp.json().then((body) => {

        if (Array.isArray(body) && contentRange && contentRangeStructure.test(contentRange)) {
          body.fullLength = parseInt(contentRangeStructure.exec(contentRange)[3], 10)
        }
        return body;
      })
    })
  }

  /**
   * Makes the ApiRequest object then-able. Allows for usage with
   * `Promise.resolve` and async/await contexts. Just a proxy for `.then()` on
   * the promise returned from `.end()`.
   *
   * @param {function} Called when the request resolves.
   * @param {function} Called when the request errors.
   * @returns {Promise} Resolves when the resolution resolves.
   */

  then (resolve, reject) {
    return this.end().then(resolve, reject)
  }

  /**
   * Just a proxy for `.catch()` on the promise returned from `.end()`.
   *
   * @param {function} Called when the request errors.
   * @returns {Promise} Resolves when there is an error.
   */

  catch (reject) {
    return this.end().catch(reject)
  }
}

/**
 * For all of the PostgREST filters add a shortcut method to use it.
 *
 * @param {string} The name of the column.
 * @param {any} The value of the column to be filtered.
 * @returns {ApiRequest} The API request object.
 */

const filters = ['eq', 'gt', 'lt', 'gte', 'lte', 'like', 'ilike', 'is', 'in', 'not']

filters.forEach(filter =>
  ApiRequest.prototype[filter] = function filterValue (name, value) {
    return this.query(`${name}=${filter}.${Array.isArray(value) ? value.join(',') : value}`)
  }
)

export default ApiRequest
