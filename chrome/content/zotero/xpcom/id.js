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
	var _initialized = false;
	var _tables = [
		'collections',
		'creators',
		'creatorData',
		'customFields',
		'customItemTypes',
		'itemDataValues',
		'items',
		'savedSearches',
		'tags'
	];
	var _nextIDs = {};
	
	
	function _init() {
		Zotero.debug("Initializing ids");
		for (let table of _tables) {
			_nextIDs[table] = _getNext(table);
		}
		_initialized = true;
	}
	
	
	/**
	 * Gets an unused primary key id for a DB table
	 */
	this.get = function (table) {
		if (!_initialized) {
			_init();
		}
		if (!_nextIDs[table]) {
			throw new Error("IDs not loaded for table '" + table + "'");
		}
		
		return ++_nextIDs[table];
	};
	
	
	function _getTableColumn(table) {
		switch (table) {
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
	
	
	/**
	 * Get MAX(id) + 1 from table
	 *
	 * @return {Promise<Integer>}
	 */
	function _getNext(table) {
		var sql = 'SELECT COALESCE(MAX(' + _getTableColumn(table) + ') + 1, 1) FROM ' + table;
		return Zotero.DB.valueQuery(sql);
	};
}

Zotero.ID = new Zotero.ID_Tracker;
