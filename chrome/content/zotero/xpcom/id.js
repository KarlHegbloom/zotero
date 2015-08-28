/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

Zotero.ID_Tracker = function () {
	this.getBigInt = getBigInt;
	this.skip = skip;
	this.getTableName = getTableName;
	
	// Number of ids to compare against at a time
	this.__defineGetter__('numIDs', function () 10000);
	
	// Number of times to try increasing the maxID if first range fails
	this.__defineGetter__('maxTries', function () 3);
	
	// Total number of ids to find
	this.__defineGetter__('maxToFind', function () 1000);
	
	var _available = {};
	var _min = {};
	var _skip = {};
	
	
	/*
	 * Gets an unused primary key id for a DB table
	 */
	this.get = Zotero.Promise.coroutine(function* (table, notNull) {
		table = this.getTableName(table);
		
		switch (table) {
			// Autoincrement tables
			//
			// Callers need to handle a potential NULL for these unless they
			// pass |notNull|
			case 'libraries':
			case 'items':
			case 'creators':
			case 'creatorData':
			case 'creatorDataAlt':
			case 'collections':
			case 'savedSearches':
			case 'tags':
			case 'customItemTypes':
			case 'customFields':
				var id = yield _getNextAvailable(table);
				if (!id && notNull) {
					return _getNext(table);
				}
				return id;
			
			// Non-autoincrement tables
			//
			// TODO: use autoincrement instead where available in 1.5
			case 'itemDataValues':
				var id = yield _getNextAvailable(table);
				if (!id) {
					// If we can't find an empty id quickly, just use MAX() + 1
					return _getNext(table);
				}
				return id;
			
			default:
				throw ("Unsupported table '" + table + "' in Zotero.ID.get()");
		}
	});
	
	function getBigInt(max) {
		if (!max) {
			max = 9007199254740991;
		}
		return Math.floor(Math.random() * (max)) + 1;
	}
	
	
	/**
	 * Mark ids as used
	 *
	 * @param	string		table
	 * @param	int|array	ids			Item ids to skip
	 */
	function skip(table, ids) {
		table = this.getTableName(table);
		
		switch (ids.constructor.name) {
			case 'Array':
				break;
				
			case 'Number':
				ids = [ids];
				break;
				
			default:
				throw ("ids must be an int or array of ints in Zotero.ID.skip()");
		}
		
		if (!ids.length) {
			return;
		}
		
		if (!_skip[table]) {
			_skip[table] = {};
		}
		
		for (var i=0, len=ids.length; i<len; i++) {
			_skip[table][ids[i]] = true;
		}
	}
	
	
	function getTableName(table) {
		// Used in sync.js
		if (table == 'searches') {
			table = 'savedSearches';
		}
		
		// Note: creatorDataAlt is used for
		// legacy data conversions on the multilingual
		// branch. When that is no longer needed, it can
		// be dropped.
		switch (table) {
			case 'collections':
			case 'creators':
			case 'creatorData':
			case 'creatorDataAlt':
			case 'itemDataValues':
			case 'items':
			case 'libraries':
			case 'savedSearches':
			case 'tags':
			case 'customItemTypes':
			case 'customFields':
				return table;
				
			default:
				throw ("Invalid table '" + table + "' in Zotero.ID");
		}
	}
	
	
	/*
	 * Returns the lowest available unused primary key id for table,
	 * or NULL if none could be loaded in _loadAvailable()
	 */
	var _getNextAvailable = Zotero.Promise.coroutine(function* (table) {
		if (!_available[table]) {
			yield _loadAvailable(table);
		}
		
		var arr = _available[table];
		
		while (arr[0]) {
			var id = arr[0][0];
			
			// End of range -- remove range
			if (id == arr[0][1]) {
				arr.shift();
				
				// Prepare table for refresh if all rows used
				if (arr.length == 0) {
					delete _available[table];
				}
			}
			// Within range -- increment
			else {
				arr[0][0]++;
			}
			
			if (_skip[table] && _skip[table][id]) {
				Zotero.debug("Skipping " + table + " id " + id);
				if (!_available[table]) {
					yield _loadAvailable(table);
				}
				continue;
			}
			
			_min[table] = id;
			return id;
		}
		return null;
	});
	
	
	/*
	 * Get MAX(id) + 1 from table
	 */
	var _getNext = Zotero.Promise.coroutine(function* (table) {
		var column = _getTableColumn(table);
		
		var sql = 'SELECT MAX(';
		if (_skip[table]) {
			var max = 0;
			for (var id in _skip[table]) {
				if (parseInt(id) > max) {
					max = parseInt(id);
				}
			}
			if (!max) {
				throw new Error("_skip['" + table + "'] must contain positive values");
			}
			sql += 'MAX(' + column + ', ' + max + ')';
		}
		else {
			sql += column;
		}
		sql += ')+1 FROM ' + table;
		return Zotero.DB.valueQueryAsync(sql);
	});
	
	
	/*
	 * Loads available ids for table into memory
	 */
	var _loadAvailable = Zotero.Promise.coroutine(function* (table) {
		Zotero.debug("Loading available ids for table '" + table + "'");
		
		var minID = _min[table] ? _min[table] + 1 : 1;
		var numIDs = Zotero.ID.numIDs; 
		var maxTries = Zotero.ID.maxTries; 
		var maxToFind = Zotero.ID.maxToFind;
		
		var column = _getTableColumn(table);
		
		switch (table) {
			case 'creators':
			case 'creatorData':
			case 'creatorDataAlt':
			case 'items':
			case 'itemDataValues':
			case 'tags':
				break;
			
			case 'libraries':
			case 'collections':
			case 'savedSearches':
			case 'customItemTypes':
			case 'customFields':
				var maxToFind = 100;
				break;
			
			default:
				throw ("Unsupported table '" + table + "' in Zotero.ID._loadAvailable()");
		}
		
		var maxID = minID + numIDs - 1;
		var sql = "SELECT " + column + " FROM " + table
			+ " WHERE " + column + " BETWEEN ? AND ? ORDER BY " + column;
		var ids = yield Zotero.DB.columnQueryAsync(sql, [minID, maxID]);
		// If no ids found, we have numIDs unused ids
		if (!ids) {
			maxID = Math.min(maxID, minID + (maxToFind - 1));
			Zotero.debug("Found " + (maxID - minID + 1) + " available ids in table '" + table + "'");
			_available[table] = [[minID, maxID]];
			return;
		}
		
		// If we didn't find any unused ids, try increasing maxID a few times
		while (ids.length == numIDs && maxTries>0) {
			Zotero.debug('No available ids found between ' + minID + ' and ' + maxID + '; trying next ' + numIDs);
			minID = maxID + 1;
			maxID = minID + numIDs - 1;
			ids = yield Zotero.DB.columnQueryAsync(sql, [minID, maxID]);
			maxTries--;
		}
		
		// Didn't find any unused ids -- _getNextAvailable() will return NULL for
		// this table for rest of session
		if (ids.length == numIDs) {
			Zotero.debug("Found no available ids in table '" + table + "'");
			_available[table] = [];
			return;
		}
		
		var available = [], found = 0, j = 0, availableStart = null;
		
		for (var i=minID; i<=maxID && found<maxToFind; i++) {
			// We've gone past the found ids, so all remaining ids up to maxID
			// are available
			if (!ids[j]) {
				available.push([i, maxID]);
				found += (maxID - i) + 1;
				break;
			}
			
			// Skip ahead while ids are occupied
			if (ids[j] == i) {
				j++;
				continue;
			}
			
			// Advance counter while it's below the next used id
			while (ids[j] > i && i<=maxID) {
				if (!availableStart) {
					availableStart = i;
				}
				i++;
				
				if ((found + (i - availableStart) + 1) > maxToFind) {
					break;
				}
			}
			if (availableStart) {
				available.push([availableStart, i-1]);
				// Keep track of how many empties we've found
				found += ((i-1) - availableStart) + 1;
				availableStart = null;
			}
			j++;
		}
		
		Zotero.debug("Found " + found + " available ids in table '" + table + "'");
		
		_available[table] = available;
	});
	
	
	function _getTableColumn(table) {
		switch (table) {
			case 'libraries':
				return 'libraryID';
			
			case 'itemDataValues':
				return 'valueID';
			
			case 'savedSearches':
				return 'savedSearchID';
			
			case 'creatorData':
				return 'creatorDataID';
			
			case 'creatorDataAlt':
				return 'creatorDataAltID';
			
			default:
				return table.substr(0, table.length - 1) + 'ID';
		}
	}
}

Zotero.ID = new Zotero.ID_Tracker;

/**
 * Notifier observer to mark saved object ids as used
 */
Zotero.ID.EventListener = new function () {
	this.init = init;
	this.notify = notify;
	
	function init() {
		Zotero.Notifier.registerObserver(this);
	}
	
	
	function notify(event, type, ids) {
		if (event == 'add') {
			try {
				var table = Zotero.ID.getTableName(type);
			}
			// Skip if not a table we handle
			catch (e) {
				return;
			}
			Zotero.ID.skip(table, ids);
		}
	}
}

