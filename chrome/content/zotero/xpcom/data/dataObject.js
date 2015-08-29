/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2013 Center for History and New Media
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

/**
 * @property {String} (readOnly) objectType
 * @property {String} (readOnly) libraryKey
 * @property {String|false|undefined} parentKey - False if no parent, or undefined if not
 *                                                applicable (e.g. search objects)
 * @property {Integer|false|undefined} parentID - False if no parent, or undefined if not
 *                                                applicable (e.g. search objects)
 */

Zotero.DataObject = function () {
	let objectType = this._objectType;
	this._ObjectType = objectType[0].toUpperCase() + objectType.substr(1);
	this._objectTypePlural = Zotero.DataObjectUtilities.getObjectTypePlural(objectType);
	this._ObjectTypePlural = this._objectTypePlural[0].toUpperCase() + this._objectTypePlural.substr(1);
	this._ObjectsClass = Zotero.DataObjectUtilities.getObjectsClassForObjectType(objectType);
	
	this._id = null;
	this._libraryID = null;
	this._key = null;
	this._dateAdded = null;
	this._dateModified = null;
	this._version = null;
	this._synced = null;
	this._identified = false;
	this._parentID = null;
	this._parentKey = null;
	
	this._relations = [];
	
	// Set in dataObjects.js
	this._inCache = false;
	
	this._loaded = {};
	this._skipDataTypeLoad = {};
	this._markAllDataTypeLoadStates(false);
	
	this._clearChanged();
};

Zotero.DataObject.prototype._objectType = 'dataObject';
Zotero.DataObject.prototype._dataTypes = ['primaryData'];

Zotero.defineProperty(Zotero.DataObject.prototype, 'objectType', {
	get: function() this._objectType
});
Zotero.defineProperty(Zotero.DataObject.prototype, 'id', {
	get: function() this._id
});
Zotero.defineProperty(Zotero.DataObject.prototype, 'libraryID', {
	get: function() this._libraryID
});
Zotero.defineProperty(Zotero.DataObject.prototype, 'key', {
	get: function() this._key
});
Zotero.defineProperty(Zotero.DataObject.prototype, 'libraryKey', {
	get: function() this._libraryID + "/" + this._key
});
Zotero.defineProperty(Zotero.DataObject.prototype, 'parentKey', {
	get: function () this._getParentKey(),
	set: function(v) this._setParentKey(v)
});
Zotero.defineProperty(Zotero.DataObject.prototype, 'parentID', {
	get: function() this._getParentID(),
	set: function(v) this._setParentID(v)
});

Zotero.defineProperty(Zotero.DataObject.prototype, 'ObjectsClass', {
	get: function() this._ObjectsClass
});


Zotero.DataObject.prototype._get = function (field) {
	if (field != 'id') this._disabledCheck();
	
	if (this['_' + field] !== null) {
		return this['_' + field];
	}
	if (field != 'libraryID' && field != 'key' && field != 'id') {
		this._requireData('primaryData');
	}
	return null;
}


Zotero.DataObject.prototype._set = function (field, value) {
	this._disabledCheck();
	
	if (field == 'id' || field == 'libraryID' || field == 'key') {
		return this._setIdentifier(field, value);
	}
	
	this._requireData('primaryData');
	
	switch (field) {
		case 'name':
			value = value.trim().normalize();
			break;
		
		case 'version':
			value = parseInt(value);
			break;
		
		case 'synced':
			value = !!value;
			break;
	}
	
	if (this['_' + field] != value || field == 'synced') {
		this._markFieldChange(field, this['_' + field]);
		if (!this._changed.primaryData) {
			this._changed.primaryData = {};
		}
		this._changed.primaryData[field] = true;
		
		switch (field) {
			default:
				this['_' + field] = value;
		}
	}
}


Zotero.DataObject.prototype._setIdentifier = function (field, value) {
	switch (field) {
	case 'id':
		value = Zotero.DataObjectUtilities.checkDataID(value);
		if (this._id) {
			if (value === this._id) {
				return;
			}
			throw new Error("ID cannot be changed");
		}
		if (this._key) {
			throw new Error("Cannot set id if key is already set");
		}
		break;
		
	case 'libraryID':
		value = Zotero.DataObjectUtilities.checkLibraryID(value);
		break;
		
	case 'key':
		if (this._libraryID === null) {
			throw new Error("libraryID must be set before key");
		}
		value = Zotero.DataObjectUtilities.checkKey(value);
		if (this._key) {
			if (value === this._key) {
				return;
			}
			throw new Error("Key cannot be changed");
		}
		if (this._id) {
			throw new Error("Cannot set key if id is already set");
		}
	}
	
	if (value === this['_' + field]) {
		return;
	}
	
	// If primary data is loaded, the only allowed identifier change is libraryID, and then only
	// for unidentified objects, and then only either if a libraryID isn't yet set (because
	// primary data gets marked as loaded when fields are set for new items, but some methods
	// (setCollections(), save()) automatically set the user library ID after that if none is
	// specified), or for searches (for the sake of the library switcher in the advanced search
	// window, though that could probably be rewritten)
	if (this._loaded.primaryData) {
		if (!(!this._identified && field == 'libraryID'
				&& (!this._libraryID || this._objectType == 'search'))) {
			throw new Error("Cannot change " + field + " after object is already loaded");
		}
	}
	
	if (field == 'id' || field == 'key') {
		this._identified = true;
	}
	
	this['_' + field] = value;
}


/**
 * Get the id of the parent object
 *
 * @return {Integer|false|undefined}  The id of the parent object, false if none, or undefined
 *                                      on object types to which it doesn't apply (e.g., searches)
 */
Zotero.DataObject.prototype._getParentID = function () {
	if (this._parentID !== null) {
		return this._parentID;
	}
	if (!this._parentKey) {
		if (this._objectType == 'search') {
			return undefined;
		}
		return false;
	}
	return this._parentID = this.ObjectsClass.getIDFromLibraryAndKey(this._libraryID, this._parentKey);
}


/**
 * Set the id of the parent object
 *
 * @param {Number|false} [id=false]
 * @return {Boolean} True if changed, false if stayed the same
 */
Zotero.DataObject.prototype._setParentID = function (id) {
	return this._setParentKey(
		id
		? this.ObjectsClass.getLibraryAndKeyFromID(Zotero.DataObjectUtilities.checkDataID(id)).key
		: false
	);
}


Zotero.DataObject.prototype._getParentKey = function () {
	if (this._objectType == 'search') {
		return undefined;
	}
	return this._parentKey ? this._parentKey : false
}

/**
 * Set the key of the parent object
 *
 * @param {String|false} [key=false]
 * @return {Boolean} True if changed, false if stayed the same
 */
Zotero.DataObject.prototype._setParentKey = function(key) {
	if (this._objectType == 'search') {
		throw new Error("Cannot set parent key for search");
	}
	
	key = Zotero.DataObjectUtilities.checkKey(key) || false;
	
	if (key === this._parentKey || (!this._parentKey && !key)) {
		return false;
	}
	this._markFieldChange('parentKey', this._parentKey);
	this._changed.parentKey = true;
	this._parentKey = key;
	this._parentID = null;
	return true;
}

//
// Relations
//
/**
 * Returns all relations of the object
 *
 * @return {Object} - Object with predicates as keys and arrays of URIs as values
 */
Zotero.DataObject.prototype.getRelations = function () {
	this._requireData('relations');
	
	var relations = {};
	for (let i=0; i<this._relations.length; i++) {
		let rel = this._relations[i];
		// Relations are stored internally as predicate-object pairs
		let p = rel[0];
		if (!relations[p]) {
			relations[p] = [];
		}
		relations[p].push(rel[1]);
	}
	return relations;
}


/**
 * Returns all relations of the object with a given predicate
 *
 * @return {String[]} - URIs linked to this object with the given predicate
 */
Zotero.DataObject.prototype.getRelationsByPredicate = function (predicate) {
	this._requireData('relations');
	
	if (!predicate) {
		throw new Error("Predicate not provided");
	}
	
	var relations = [];
	for (let i=0; i<this._relations.length; i++) {
		let rel = this._relations[i];
		// Relations are stored internally as predicate-object pairs
		let p = rel[0];
		if (p !== predicate) {
			continue;
		}
		relations.push(rel[1]);
	}
	return relations;
}


/**
 * @return {Boolean} - True if the relation has been queued, false if it already exists
 */
Zotero.DataObject.prototype.addRelation = function (predicate, object) {
	this._requireData('relations');
	
	if (!predicate) {
		throw new Error("Predicate not provided");
	}
	if (!object) {
		throw new Error("Object not provided");
	}
	
	for (let i = 0; i < this._relations.length; i++) {
		let rel = this._relations[i];
		if (rel[0] == predicate && rel[1] == object) {
			Zotero.debug("Relation " + predicate + " - " + object + " already exists for "
				+ this._objectType + " " + this.libraryKey);
			return false;
		}
	}
	
	this._markFieldChange('relations', this._relations);
	this._changed.relations = true;
	this._relations.push([predicate, object]);
	return true;
}


Zotero.DataObject.prototype.hasRelation = function (predicate, object) {
	this._requireData('relations');
	
	for (let i = 0; i < this._relations.length; i++) {
		let rel = this._relations[i];
		if (rel[0] == predicate && rel[1] == object) {
			return true
		}
	}
	return false;
}


Zotero.DataObject.prototype.removeRelation = function (predicate, object) {
	this._requireData('relations');
	
	for (let i = 0; i < this._relations.length; i++) {
		let rel = this._relations[i];
		if (rel[0] == predicate && rel[1] == object) {
			Zotero.debug("Removing relation " + predicate + " - " + object + " from "
				+ this._objectType + " " + this.libraryKey);
			this._markFieldChange('relations', this._relations);
			this._changed.relations = true;
			this._relations.splice(i, 1);
			return true;
		}
	}
	
	Zotero.debug("Relation " + predicate + " - " + object + " did not exist for "
		+ this._objectType + " " + this.libraryKey);
	return false;
}


/**
 * Updates the object's relations
 *
 * @param {Object} newRelations Object with predicates as keys and URI[] as values
 * @return {Boolean} True if changed, false if stayed the same
 */
Zotero.DataObject.prototype.setRelations = function (newRelations) {
	this._requireData('relations');
	
	var oldRelations = this._relations;
	
	// Relations are stored internally as a flat array with individual predicate-object pairs,
	// so convert the incoming relations to that
	var newRelationsFlat = this._flattenRelations(newRelations);
	
	var changed = false;
	if (oldRelations.length != newRelationsFlat.length) {
		changed = true;
	}
	else {
		let sortFunc = function (a, b) {
			if (a[0] < b[0]) return -1;
			if (a[0] > b[0]) return 1;
			if (a[1] < b[1]) return -1;
			if (a[1] > b[1]) return 1;
			return 0;
		};
		oldRelations.sort(sortFunc);
		newRelationsFlat.sort(sortFunc);
		
		for (let i=0; i<oldRelations.length; i++) {
			if (oldRelations[i][0] != newRelationsFlat[i][0]
					|| oldRelations[i][1] != newRelationsFlat[i][1]) {
				changed = true;
				break;
			}
		}
	}
	
	if (!changed) {
		Zotero.debug("Relations have not changed for " + this._objectType + " " + this.libraryKey, 4);
		return false;
	}
	
	this._markFieldChange('relations', this._relations);
	this._changed.relations = true;
	this._relations = newRelationsFlat;
	return true;
}


/**
 * Return an object in the specified library equivalent to this object
 *
 * Use Zotero.Collection.getLinkedCollection() and Zotero.Item.getLinkedItem() instead of
 * calling this directly.
 *
 * @param {Integer} [libraryID]
 * @return {Promise<Zotero.DataObject>|false} Linked object, or false if not found
 */
Zotero.DataObject.prototype._getLinkedObject = Zotero.Promise.coroutine(function* (libraryID, bidirectional) {
	if (!libraryID) {
		throw new Error("libraryID not provided");
	}
	
	if (libraryID == this._libraryID) {
		throw new Error(this._ObjectType + " is already in library " + libraryID);
	}
	
	yield this.loadRelations();
	
	var predicate = Zotero.Relations.linkedObjectPredicate;
	var libraryObjectPrefix = Zotero.URI.getLibraryURI(libraryID)
		+ "/" + this._objectTypePlural + "/";
	
	// Try the relations with this as a subject
	var uris = this.getRelationsByPredicate(predicate);
	for (let i = 0; i < uris.length; i++) {
		let uri = uris[i];
		if (uri.startsWith(libraryObjectPrefix)) {
			let obj = yield Zotero.URI['getURI' + this._ObjectType](uri);
			if (!obj) {
				Zotero.debug("Referenced linked " + this._objectType + " '" + uri + "' not found "
					+ "in Zotero." + this._ObjectType + "::getLinked" + this._ObjectType + "()", 2);
				continue;
			}
			return obj;
		}
	}
	
	// Then try relations with this as an object
	if (bidirectional) {
		var thisURI = Zotero.URI['get' + this._ObjectType + 'URI'](this);
		var objects = yield Zotero.Relations.getByPredicateAndObject(
			this._objectType, predicate, thisURI
		);
		for (let i = 0; i < objects.length; i++) {
			let obj = objects[i];
			if (obj.objectType != this._objectType) {
				Zotero.logError("Found linked object of different type "
					+ "(expected " + this._objectType + ", found " + obj.objectType + ")");
				continue;
			}
			if (obj.libraryID == libraryID) {
				return obj;
			}
		}
	}
	
	return false;
});


/**
 * Add a linked-item relation to a pair of objects
 *
 * A separate save() is not required.
 *
 * @param {Zotero.DataObject} object
 * @param {Promise<Boolean>}
 */
Zotero.DataObject.prototype._addLinkedObject = Zotero.Promise.coroutine(function* (object) {
	if (object.libraryID == this._libraryID) {
		throw new Error("Can't add linked " + this._objectType + " in same library");
	}
	
	yield this.loadRelations();
	
	var predicate = Zotero.Relations.linkedObjectPredicate;
	var thisURI = Zotero.URI['get' + this._ObjectType + 'URI'](this);
	var objectURI = Zotero.URI['get' + this._ObjectType + 'URI'](object);
	
	var exists = this.hasRelation(predicate, objectURI);
	if (exists) {
		Zotero.debug(this._ObjectTypePlural + " " + this.libraryKey
			+ " and " + object.libraryKey + " are already linked");
		return false;
	}
	
	// If one of the items is a personal library, store relation with that. Otherwise, use
	// current item's library (which in calling code is the new, copied item, since that's what
	// the user definitely has access to).
	var userLibraryID = Zotero.Libraries.userLibraryID;
	if (this.libraryID == userLibraryID || object.libraryID != userLibraryID) {
		this.addRelation(predicate, objectURI);
		yield this.save({
			skipDateModifiedUpdate: true,
			skipSelect: true
		});
	}
	else {
		yield object.loadRelations();
		object.addRelation(predicate, thisURI);
		yield object.save({
			skipDateModifiedUpdate: true,
			skipSelect: true
		});
	}
	
	return true;
});


/*
 * Build object from database
 */
Zotero.DataObject.prototype.loadPrimaryData = Zotero.Promise.coroutine(function* (reload, failOnMissing) {
	if (this._loaded.primaryData && !reload) return;
	
	var id = this._id;
	var key = this._key;
	var libraryID = this._libraryID;
	
	if (!id && !key) {
		throw new Error('ID or key not set in Zotero.' + this._ObjectType + '.loadPrimaryData()');
	}
	
	var columns = [], join = [], where = [];
	var primaryFields = this.ObjectsClass.primaryFields;
	var idField = this.ObjectsClass.idColumn;
	for (let i=0; i<primaryFields.length; i++) {
		let field = primaryFields[i];
		// If field not already set
		if (field == idField || this['_' + field] === null || reload) {
			columns.push(this.ObjectsClass.getPrimaryDataSQLPart(field));
		}
	}
	if (!columns.length) {
		return;
	}
	
	// This should match Zotero.*.primaryDataSQL, but without
	// necessarily including all columns
	var sql = "SELECT " + columns.join(", ") + this.ObjectsClass.primaryDataSQLFrom;
	if (id) {
		sql += " AND O." + idField + "=? ";
		var params = id;
	}
	else {
		sql += " AND O.key=? AND O.libraryID=? ";
		var params = [key, libraryID];
	}
	sql += (where.length ? ' AND ' + where.join(' AND ') : '');
	var row = yield Zotero.DB.rowQueryAsync(sql, params);
	
	if (!row) {
		if (failOnMissing) {
			throw new Error(this._ObjectType + " " + (id ? id : libraryID + "/" + key)
				+ " not found in Zotero." + this._ObjectType + ".loadPrimaryData()");
		}
		this._clearChanged('primaryData');
		
		// If object doesn't exist, mark all data types as loaded
		this._markAllDataTypeLoadStates(true);
		
		return;
	}
	
	this.loadFromRow(row, reload);
});


Zotero.DataObject.prototype.loadRelations = Zotero.Promise.coroutine(function* (reload) {
	if (this._objectType != 'collection' && this._objectType != 'item') {
		throw new Error("Relations not supported for " + this._objectTypePlural);
	}
	
	if (this._loaded.relations && !reload) {
		return;
	}
	
	Zotero.debug("Loading relations for " + this._objectType + " " + this.libraryKey);
	
	this._requireData('primaryData');
	
	var sql = "SELECT predicate, object FROM " + this._objectType + "Relations "
		+ "JOIN relationPredicates USING (predicateID) "
		+ "WHERE " + this.ObjectsClass.idColumn + "=?";
	var rows = yield Zotero.DB.queryAsync(sql, this.id);
	
	var relations = {};
	function addRel(predicate, object) {
		if (!relations[predicate]) {
			relations[predicate] = [];
		}
		relations[predicate].push(object);
	}
	
	for (let i = 0; i < rows.length; i++) {
		let row = rows[i];
		addRel(row.predicate, row.object);
	}
	
	/*if (this._objectType == 'item') {
		let getURI = Zotero.URI["get" + this._ObjectType + "URI"].bind(Zotero.URI);
		let objectURI = getURI(this);
		
		// Related items are bidirectional, so include any pointing to this object
		let objects = yield Zotero.Relations.getByPredicateAndObject(
			Zotero.Relations.relatedItemPredicate, objectURI
		);
		for (let i = 0; i < objects.length; i++) {
			addRel(Zotero.Relations.relatedItemPredicate, getURI(objects[i]));
		}
		
		// Also include any owl:sameAs relations pointing to this object
		objects = yield Zotero.Relations.getByPredicateAndObject(
			Zotero.Relations.linkedObjectPredicate, objectURI
		);
		for (let i = 0; i < objects.length; i++) {
			addRel(Zotero.Relations.linkedObjectPredicate, getURI(objects[i]));
		}
	}*/
	
	// Relations are stored as predicate-object pairs
	this._relations = this._flattenRelations(relations);
	this._loaded.relations = true;
	this._clearChanged('relations');
});


/**
 * Reloads loaded, changed data
 *
 * @param {String[]} [dataTypes] - Data types to reload, or all loaded types if not provide
 * @param {Boolean} [reloadUnchanged=false] - Reload even data that hasn't changed internally.
 *                                            This should be set to true for data that was
 *                                            changed externally (e.g., globally renamed tags).
 */
Zotero.DataObject.prototype.reload = Zotero.Promise.coroutine(function* (dataTypes, reloadUnchanged) {
	if (!this._id) {
		return;
	}
	
	if (!dataTypes) {
		dataTypes = Object.keys(this._loaded).filter(
			val => this._loaded[val]
		);
	}
	
	if (dataTypes && dataTypes.length) {
		for (let i=0; i<dataTypes.length; i++) {
			let dataType = dataTypes[i];
			if (!this._loaded[dataType] || this._skipDataTypeLoad[dataType]
					|| (!reloadUnchanged && !this._changed[dataType])) {
				continue;
			}
			yield this._loadDataType(dataType, true);
		}
	}
});

/**
 * Checks wheteher a given data type has been loaded
 *
 * @param {String} [dataType=primaryData] Data type to check
 * @throws {Zotero.DataObjects.UnloadedDataException} If not loaded, unless the
 *   data has not yet been "identified"
 */
Zotero.DataObject.prototype._requireData = function (dataType) {
	if (this._loaded[dataType] === undefined) {
		throw new Error(dataType + " is not a valid data type for " + this._ObjectType + " objects");
	}
	
	if (dataType != 'primaryData') {
		this._requireData('primaryData');
	}
	
	if (!this._identified) {
		this._loaded[dataType] = true;
	}
	else if (!this._loaded[dataType]) {
		throw new Zotero.Exception.UnloadedDataException(
			"'" + dataType + "' not loaded for " + this._objectType + " ("
				+ this._id + "/" + this._libraryID + "/" + this._key + ")",
			dataType
		);
	}
}


/**
 * Loads data for a given data type
 * @param {String} dataType
 * @param {Boolean} reload
 */
Zotero.DataObject.prototype._loadDataType = function (dataType, reload) {
	return this["load" + dataType[0].toUpperCase() + dataType.substr(1)](reload);
}

Zotero.DataObject.prototype.loadAllData = function (reload) {
	let loadPromises = new Array(this._dataTypes.length);
	for (let i=0; i<this._dataTypes.length; i++) {
		let type = this._dataTypes[i];
		if (!this._skipDataTypeLoad[type]) {
			loadPromises[i] = this._loadDataType(type, reload);
		}
	}
	
	return Zotero.Promise.all(loadPromises);
}

Zotero.DataObject.prototype._markAllDataTypeLoadStates = function (loaded) {
	for (let i = 0; i < this._dataTypes.length; i++) {
		this._loaded[this._dataTypes[i]] = loaded;
	}
}

/**
 * Save old version of data that's being changed, to pass to the notifier
 * @param {String} field
 * @param {} oldValue
 */

// XXX zzz Logical problem here. To change value on an existing variant,
// XXX zzz we need the CURRENT langTag. To change the value on main, we
// XXX zzz need the OLD langTag. Which is used can depend on whether forceTop
// XXX zzz is in force, but it's confusing.

Zotero.DataObject.prototype._markFieldChange = function (field, oldValue, langTag, forceTop) {
	// Only save if object already exists and field not already changed
	if (!this.id) {
		return;
	}
    if (langTag) {
        if (field === 'creators') {
            if (!this._previousData.multi) {
                this._previousData.multi = {_key:{}};
            }
        } else {
            if (!this._previousData.multi) {
                this._previousData.multi = {_keys:{},main:{}};
            }
        }
    }
    if (!langTag || forceTop) {
        if (typeof this._previousData[field] == 'undefined') {
	        if (Array.isArray(oldValue)) {
		        this._previousData[field] = [];
		        Object.assign(this._previousData[field], oldValue);
	        } else {
		        this._previousData[field] = oldValue;
	        }
        }
        if (langTag) {
            if (typeof this._previousData.multi.main[field] == 'undefined') {
                this._previousData.multi.main[field] = langTag;
            }
        }
    } else {
        // langTag && !forceTop
        if (!this._previousData.multi._keys[field]) {
            this._previousData.multi._keys[field] = {};
        }
        if (typeof this._previousData.multi._keys[field][langTag] == 'undefined') {
	        if (Array.isArray(oldValue)) {
		        this._previousData.multi._keys[field][langTag] = [];
		        Object.assign(this._previousData.multi._keys[field][langTag], oldValue);
	        } else {
                this._previousData.multi._keys[field][langTag] = oldValue;
	        }
        }
    }
}


Zotero.DataObject.prototype.hasChanged = function() {
	var changed = Object.keys(this._changed).filter(dataType => this._changed[dataType]);
	if (changed.length == 1
			&& changed[0] == 'primaryData'
			&& Object.keys(this._changed.primaryData).length == 1
			&& this._changed.primaryData.synced
			&& this._previousData.synced == this._synced) {
		return false;
	}
	return !!changed.length;
}


/**
 * Clears log of changed values
 * @param {String} [dataType] data type/field to clear. Defaults to clearing everything
 */
Zotero.DataObject.prototype._clearChanged = function (dataType) {
	if (dataType) {
		delete this._changed[dataType];
		delete this._previousData[dataType];
	}
	else {
		this._changed = {};
		this._previousData = {};
	}
}

/**
 * Clears field change log
 * @param {String} field
 */
Zotero.DataObject.prototype._clearFieldChange = function (field) {
	delete this._previousData[field];
    if (this._previousData.multi) {
        delete this._previousData.multi.main[field];
        delete this._previousData.multi._keys[field];
    }
}


Zotero.DataObject.prototype.isEditable = function () {
	return Zotero.Libraries.isEditable(this.libraryID);
}


Zotero.DataObject.prototype.editCheck = function () {
	if ((this._objectType == 'collection' || this._objectType == 'search')
			&& Zotero.Libraries.getType(this.libraryID) == 'publications') {
		throw new Error(this._ObjectTypePlural + " cannot be added to My Publications");
	}
	
	if (!Zotero.Sync.Server.updatesInProgress && !Zotero.Sync.Storage.updatesInProgress && !this.isEditable()) {
		throw ("Cannot edit " + this._objectType + " in read-only Zotero library");
	}
}

/**
 * Save changes to database
 *
 * @param {Object} [options]
 * @param {Boolean} [options.skipCache] - Don't save add new object to the cache; if set, object
 *                                         is disabled after save
 * @param {Boolean} [options.skipDateModifiedUpdate]
 * @param {Boolean} [options.skipClientDateModifiedUpdate]
 * @param {Boolean} [options.skipNotifier] - Don't trigger Zotero.Notifier events
 * @param {Boolean} [options.skipSelect] - Don't select object automatically in trees
 * @param {Boolean} [options.skipSyncedUpdate] - Don't automatically set 'synced' to false
 * @return {Promise<Integer|Boolean>}  Promise for itemID of new item,
 *                                     TRUE on item update, or FALSE if item was unchanged
 */
Zotero.DataObject.prototype.save = Zotero.Promise.coroutine(function* (options) {
	options = options || {};
	var env = {
		options: options,
		transactionOptions: {}
	};
	
	if (!env.options.tx && !Zotero.DB.inTransaction()) {
		Zotero.logError("save() called on Zotero." + this._ObjectType + " without a wrapping "
			+ "transaction -- use saveTx() instead");
		Zotero.debug((new Error).stack, 2);
		env.options.tx = true;
	}
	
	var proceed = yield this._initSave(env);
	if (!proceed) return false;
	
	if (env.isNew) {
		Zotero.debug('Saving data for new ' + this._objectType + ' to database', 4);
	}
	else {
		Zotero.debug('Updating database with new ' + this._objectType + ' data', 4);
	}
	
	try {
		if (Zotero.DataObject.prototype._finalizeSave == this._finalizeSave) {
			throw new Error("_finalizeSave not implemented for Zotero." + this._ObjectType);
		}
		
		env.notifierData = {};
		if (env.options.skipSelect) {
			env.notifierData.skipSelect = true;
		}
		if (!env.isNew) {
			env.changed = this._previousData;
		}
		
		// Create transaction
		if (env.options.tx) {
			let result = yield Zotero.DB.executeTransaction(function* () {
				Zotero.DataObject.prototype._saveData.call(this, env);
				yield this._saveData(env);
				yield Zotero.DataObject.prototype._finalizeSave.call(this, env);
				return this._finalizeSave(env);
			}.bind(this), env.transactionOptions);
			return result;
		}
		// Use existing transaction
		else {
			Zotero.DB.requireTransaction();
			Zotero.DataObject.prototype._saveData.call(this, env);
			yield this._saveData(env);
			yield Zotero.DataObject.prototype._finalizeSave.call(this, env);
			return this._finalizeSave(env);
		}
	}
	catch(e) {
		return this._recoverFromSaveError(env, e)
		.catch(function(e2) {
			Zotero.debug(e2, 1);
		})
		.then(function() {
			if (env.options.errorHandler) {
				env.options.errorHandler(e);
			}
			else {
				Zotero.debug(e, 1);
			}
			throw e;
		})
	}
});


Zotero.DataObject.prototype.saveTx = function (options) {
	options = options || {};
	options.tx = true;
	return this.save(options);
}


Zotero.DataObject.prototype._initSave = Zotero.Promise.coroutine(function* (env) {
	// Default to user library if not specified
	if (this.libraryID === null) {
		this._libraryID = Zotero.Libraries.userLibraryID;
	}
	
	env.isNew = !this.id;
	
	if (!env.options.skipEditCheck) {
		this.editCheck();
	}
	
	if (!this.hasChanged()) {
		Zotero.debug(this._ObjectType + ' ' + this.id + ' has not changed', 4);
		return false;
	}
	
	// Undo registerObject() on failure
	var func = function () {
		this.ObjectsClass.unload(env.id);
	}.bind(this);
	if (env.options.tx) {
		env.transactionOptions.onRollback = func;
	}
	else {
		Zotero.DB.addCurrentCallback("rollback", func);
	}
	
	return true;
});

Zotero.DataObject.prototype._saveData = function (env) {
	var libraryID = env.libraryID = this.libraryID || Zotero.Libraries.userLibraryID;
	var key = env.key = this._key = this.key ? this.key : this._generateKey();
	
	env.sqlColumns = [
		'libraryID',
		'key'
	];
	env.sqlValues = [
		libraryID,
		key
	];
	
	if (this._changed.primaryData && this._changed.primaryData.version) {
		env.sqlColumns.push('version');
		env.sqlValues.push(this.version || 0);
	}
	
	if (this._changed.primaryData && this._changed.primaryData.synced) {
		env.sqlColumns.push('synced');
		env.sqlValues.push(this.synced ? 1 : 0);
	}
	// Set synced to 0 by default
	else if (!env.isNew && !env.options.skipSyncedUpdate) {
		env.sqlColumns.push('synced');
		env.sqlValues.push(0);
	}
	
	if (env.isNew || !env.options.skipClientDateModified) {
		env.sqlColumns.push('clientDateModified');
		env.sqlValues.push(Zotero.DB.transactionDateTime);
	}
};

Zotero.DataObject.prototype._finalizeSave = Zotero.Promise.coroutine(function* (env) {
	// Relations
	if (this._changed.relations) {
		let toAdd, toRemove;
		// Convert to individual JSON objects, diff, and convert back
		if (this._previousData.relations) {
			let oldRelationsJSON = this._previousData.relations.map(x => JSON.stringify(x));
			let newRelationsJSON = this._relations.map(x => JSON.stringify(x));
			toAdd = Zotero.Utilities.arrayDiff(newRelationsJSON, oldRelationsJSON)
				.map(x => JSON.parse(x));
			toRemove = Zotero.Utilities.arrayDiff(oldRelationsJSON, newRelationsJSON)
				.map(x => JSON.parse(x));
		}
		else {
			toAdd = this._relations;
			toRemove = [];
		}
		
		if (toAdd.length) {
			let sql = "INSERT INTO " + this._objectType + "Relations "
				+ "(" + this._ObjectsClass.idColumn + ", predicateID, object) VALUES ";
			// Convert predicates to ids
			for (let i = 0; i < toAdd.length; i++) {
				toAdd[i][0] = yield Zotero.RelationPredicates.add(toAdd[i][0]);
			}
			yield Zotero.DB.queryAsync(
				sql + toAdd.map(x => "(?, ?, ?)").join(", "),
				toAdd.map(x => [this.id, x[0], x[1]])
				.reduce((x, y) => x.concat(y))
			);
		}
		
		if (toRemove.length) {
			for (let i = 0; i < toRemove.length; i++) {
				let sql = "DELETE FROM " + this._objectType + "Relations "
					+ "WHERE " + this._ObjectsClass.idColumn + "=? AND predicateID=? AND object=?";
				yield Zotero.DB.queryAsync(
					sql,
					[
						this.id,
						(yield Zotero.RelationPredicates.add(toRemove[i][0])),
						toRemove[i][1]
					]
				);
			}
		}
	}
	
	if (env.isNew) {
		if (!env.skipCache) {
			// Register this object's identifiers in Zotero.DataObjects
			this.ObjectsClass.registerObject(this);
		}
		// If object isn't being reloaded, disable it, since its data may be out of date
		else {
			this._disabled = true;
		}
	}
	else if (env.skipCache) {
		Zotero.logError("skipCache is only for new objects");
	}
});

Zotero.DataObject.prototype._recoverFromSaveError = Zotero.Promise.coroutine(function* (env) {
	yield this.reload(null, true);
	this._clearChanged();
});


/**
 * Update object version, efficiently
 *
 * Used by sync code
 *
 * @param {Integer} version
 * @param {Boolean} [skipDB=false]
 */
Zotero.DataObject.prototype.updateVersion = Zotero.Promise.coroutine(function* (version, skipDB) {
	if (!this.id) {
		throw new Error("Cannot update version of unsaved " + this._objectType);
	}
	if (version != parseInt(version)) {
		throw new Error("'version' must be an integer");
	}
	
	this._version = parseInt(version);
	
	if (!skipDB) {
		var cl = this.ObjectsClass;
		var sql = "UPDATE " + cl.table + " SET version=? WHERE " + cl.idColumn + "=?";
		yield Zotero.DB.queryAsync(sql, [parseInt(version), this.id]);
	}
	
	if (this._changed.primaryData && this._changed.primaryData.version) {
		if (Objects.keys(this._changed.primaryData).length == 1) {
			delete this._changed.primaryData;
		}
		else {
			delete this._changed.primaryData.version;
		}
	}
});

/**
 * Update object sync status, efficiently
 *
 * Used by sync code
 *
 * @param {Boolean} synced
 * @param {Boolean} [skipDB=false]
 */
Zotero.DataObject.prototype.updateSynced = Zotero.Promise.coroutine(function* (synced, skipDB) {
	if (!this.id) {
		throw new Error("Cannot update sync status of unsaved " + this._objectType);
	}
	if (typeof synced != 'boolean') {
		throw new Error("'synced' must be a boolean");
	}
	
	this._synced = synced;
	
	if (!skipDB) {
		var cl = this.ObjectsClass;
		var sql = "UPDATE " + cl.table + " SET synced=? WHERE " + cl.idColumn + "=?";
		yield Zotero.DB.queryAsync(sql, [synced ? 1 : 0, this.id]);
	}
	
	if (this._changed.primaryData && this._changed.primaryData.synced) {
		if (Objects.keys(this._changed.primaryData).length == 1) {
			delete this._changed.primaryData;
		}
		else {
			delete this._changed.primaryData.synced;
		}
	}
});

/**
 * Delete object from database
 *
 * @param {Object} [options]
 * @param {Boolean} [options.skipDeleteLog] - Don't add to sync delete log
 */
Zotero.DataObject.prototype.erase = Zotero.Promise.coroutine(function* (options) {
	options = options || {};
	var env = {
		options: options
	};
	
	if (!env.options.tx && !Zotero.DB.inTransaction()) {
		Zotero.logError("erase() called on Zotero." + this._ObjectType + " without a wrapping "
			+ "transaction -- use eraseTx() instead");
		Zotero.debug((new Error).stack, 2);
		env.options.tx = true;
	}
	
	Zotero.debug('Deleting ' + this.objectType + ' ' + this.id);
	
	if (env.options.tx) {
		return Zotero.DB.executeTransaction(function* () {
			Zotero.DataObject.prototype._initErase.call(this, env);
			yield this._eraseData(env);
			Zotero.DataObject.prototype._finalizeErase.call(this, env);
		}.bind(this))
	}
	else {
		Zotero.DB.requireTransaction();
		Zotero.DataObject.prototype._initErase.call(this, env);
		yield this._eraseData(env);
		yield Zotero.DataObject.prototype._finalizeErase.call(this, env);
	}
});

Zotero.DataObject.prototype.eraseTx = function (options) {
	options = options || {};
	options.tx = true;
	return this.erase(options);
};

Zotero.DataObject.prototype._initErase = function (env) {
	env.notifierData = {};
	env.notifierData[this.id] = {
		libraryID: this.libraryID,
		key: this.key
	};
	
	if (env.options.skipDeleteLog) {
		env.notifierData[this.id].skipDeleteLog = true;
	}
};

Zotero.DataObject.prototype._finalizeErase = Zotero.Promise.coroutine(function* (env) {
	// Delete versions from sync cache
	yield Zotero.Sync.Data.Local.deleteCacheObject(this.objectType, this._libraryID, this._key);
	
	Zotero.DB.addCurrentCallback("commit", function () {
		this.ObjectsClass.unload(env.deletedObjectIDs || this.id);
	}.bind(this));
	
	if (!env.options.skipNotifier) {
		Zotero.Notifier.queue(
			'delete',
			this._objectType,
			Object.keys(env.notifierData).map(id => parseInt(id)),
			env.notifierData
		);
	}
});


Zotero.DataObject.prototype.toResponseJSON = Zotero.Promise.coroutine(function* (options) {
	// TODO: library block?
	
	return {
		key: this.key,
		version: this.version,
		meta: {},
		data: yield this.toJSON(options)
	};
});


Zotero.DataObject.prototype._preToJSON = function (options) {
	var env = { options };
	env.mode = options.mode || 'new';
	if (env.mode == 'patch') {
		if (!options.patchBase) {
			throw new Error("Cannot use patch mode if patchBase not provided");
		}
	}
	else if (options.patchBase) {
		if (options.mode) {
			Zotero.debug("Zotero.Item.toJSON: ignoring provided patchBase in " + env.mode + " mode", 2);
		}
		// If patchBase provided and no explicit mode, use 'patch'
		else {
			env.mode = 'patch';
		}
	}
	return env;
}

Zotero.DataObject.prototype._postToJSON = function (env) {
	if (env.mode == 'patch') {
		env.obj = Zotero.DataObjectUtilities.patch(env.options.patchBase, env.obj);
	}
	return env.obj;
}


/**
 * Generates data object key
 * @return {String} key
 */
Zotero.DataObject.prototype._generateKey = function () {
	return Zotero.Utilities.generateObjectKey();
}

Zotero.DataObject.prototype._disabledCheck = function () {
	if (this._disabled) {
		Zotero.logError(this._ObjectType + " is disabled -- "
			+ "use Zotero." + this._ObjectTypePlural  + ".getAsync()");
	}
}


/**
 * Flatten API JSON relations object into an array of unique predicate-object pairs
 *
 * @param {Object} relations - Relations object in API JSON format, with predicates as keys
 *                             and arrays of URIs as objects
 * @return {Array[]} - Predicate-object pairs
 */
Zotero.DataObject.prototype._flattenRelations = function (relations) {
	var relationsFlat = [];
	for (let predicate in relations) {
		let object = relations[predicate];
		if (Array.isArray(object)) {
			object = Zotero.Utilities.arrayUnique(object);
			for (let i = 0; i < object.length; i++) {
				relationsFlat.push([predicate, object[i]]);
			}
		}
		else if (typeof object == 'string') {
			relationsFlat.push([predicate, object]);
		}
		else {
			Zotero.debug(object, 1);
			throw new Error("Invalid relation value");
		}
	}
	return relationsFlat;
}
