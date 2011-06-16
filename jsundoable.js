/*! Copyright (c) 2010 Jonathan Scott (http://jscott.me)
 * Dual licensed under the MIT (http://www.opensource.org/licenses/mit-license.php) 
 * and GPL (http://www.opensource.org/licenses/gpl-license.php) licenses.
 *
 * Version: 1.1
 * Docs: http://jscott.me/jsundoable.html
 */
(function() {
    
    var settings = {
		'max_undo': 20,
		'undoChange': function() {},
		'redoChange': function() {}
	};
    
    /**
     * Create a new Undo Manager
     * @param set The settings for the manager
     */
    var UndoManager = function(set) {
    	// An index of all functions in either the undo_queue or the redo_queue
    	this.action_index = {};
    	this.next_id = 1; // The next id to use for an index
	
    	// FIFO queues for undo/redo
    	this.undo_queue = [];
    	this.redo_queue = [];
	
    	// The currently used action (if undoing or redoing)
    	this.current_action = null;
	
    	// The current group (if one is active)
    	this.group = null;
	
    	// A stack of active groups, to allow for embedding
    	this.group_queue = [];
    	this.group_id = 0;
    	
    	// can be: '', 'UNDO', 'REDO'
    	this.working = '';
    	
    	this.undo_available = 0; // The count of the available undos
    	this.undo_names = []; // The last few names
    	this.redo_available = 0; // The count of the available redos
    	this.redo_names = [];
    	
        this.changeSettings(set);
    };
    
    /**
     * Update the settings for this manager
     */
    UndoManager.prototype.changeSettings = function(set) {
    	this.settings = settings;
    	for (attrname in set) {
    	    if (set.hasOwnProperty(attrname)) {
        	    this.settings[attrname] = set[attrname];
        	}
    	}
    	this.settings = $.extend(settings, set);
    };
	
	/**
	 * Run an array of undoable functions
	 */
	UndoManager.prototype.groupRunner = function(actions) {
		var id;
		while ((id = actions.pop())) {
			var action = this.action_index[id];
			delete this.action_index[id];
			// 0 = name, 1 = function, 2 = parameters, 3 = context
			action[1].apply(action[3], action[2]);
		}
	};
	
	/**
	 * Report the function used to undo the current action
	 */
	UndoManager.prototype.undoable = function(name, func, parameters, context, id, add_to_queue_overwrite) {
		if (this.group !== null) {
			// There is a group open, so add this to the group
			
			id = id || this.next_id++;
			this.action_index[id] = [name, func, parameters, context];
			this.group[2][0].push(id);
			return this;
		}
		
		var queue = this.undo_queue;
		if (this.working == 'UNDO') {
			queue = this.redo_queue;
		}
		
		// Get the index id
		id = id || this.next_id++;
		
		// Index the function
		this.action_index[id] = [name, func, parameters, context];
		
		if (!add_to_queue_overwrite) {
			// Push the function into the queue
			queue.push(id);
			if (queue.length > this.settings.max_undo) {
				queue.shift();
				if (this.working == 'UNDO') {
					this.redo_available--;
					this.redo_names.shift();
				} else {
					this.undo_available--;
					this.undo_names.shift();
				}
			}
		
			if (this.working == 'UNDO') {
				this.redo_available++;
				this.redo_names.push(this.current_action[0]);
				this.settings.redoChange();
			} else {
				this.undo_available++;
				if (this.working == 'REDO') {
					this.undo_names.push(this.current_action[0]);
				} else {
					// A new action means a new "path" so clear the redo queue
					this.clearRedoQueue();
					this.undo_names.push(name);
				}
				this.settings.undoChange();
			}
		}
		
		return this;
	};
	
	/**
	 * Undo the last action
	 */
	UndoManager.prototype.undo = function() {
		if (this.undo_queue.length > 0) {
			// There are undo available
			
			// Next undo ID
			var id = this.undo_queue.pop();
			this.undo_available--;
			this.undo_names.pop();
			
			// Pull from index
			var action = this.action_index[id];
			delete this.action_index[id];
			
			this.working = 'UNDO';
			this.current_action = action;
			// 0 = name, 1 = function, 2 = parameters, 3 = context
			
			// Put a group around the undo - this means that the redo should only be one action too
			this.startGroup(action[0]);
			action[1].apply(action[3], action[2]);
			this.endGroup();
			delete this.current_action;
			this.working = '';
			
			this.settings.undoChange();
		}
		
		return this;
	};
	
	UndoManager.prototype.clearUndoQueue = function() {
		for(var i = this.undo_queue.length-1; i>=0; i--) {
			delete this.action_index[this.undo_queue[i]];
		}
		this.undo_queue = [];
		this.undo_available = 0;
		this.redo_names = [];
		
		this.settings.undoChange();
		return this;
	};
	
	UndoManager.prototype.clearQueues = function() {
		this.action_index = {};
		this.undo_queue = [];
		this.undo_available = 0;
		this.undo_names = [];
		this.redo_queue = [];
		this.redo_available = 0;
		this.redo_names = [];
		this.settings.undoChange();
		this.settings.redoChange();
		return this;
	};
	
	/**
	 * Redo the last action undone
	 */
	UndoManager.prototype.redo = function() {
		if (this.redo_queue.length > 0) {
			// There are redo available
			
			// Next redo ID
			var id = this.redo_queue.pop();
			this.redo_available--;
			this.redo_names.pop();
			
			// Pull from index
			var action = this.action_index[id];
			delete this.action_index[id];
			
			this.working = 'REDO';
			this.current_action = action;
			// 0 = name, 1 = function, 2 = parameters, 3 = context
			
			// Group around the redo
			this.startGroup(action[0]);
			action[1].apply(action[3], action[2]);
			this.endGroup();
			delete this.current_action;
			this.working = '';
			
			this.settings.redoChange();
		}
		
		return this;
	};
	
	/**
	 * Clear the redo queue
	 */
	UndoManager.prototype.clearRedoQueue = function() {
		for(var i = this.redo_queue.length-1; i>=0; i--) {
			delete this.action_index[this.redo_queue[i]];
		}
		this.redo_queue = [];
		this.redo_available = 0;
		this.redo_names = [];
		
		this.settings.redoChange();
		return this;
	};
	
	/*
	 * Groups
	 */
	
	/**
	 * Start a new group
	 * @param name The group name
	 * @return The group ID
	 */
	UndoManager.prototype.startGroup = function(name) {
		if (this.group !== null) {
			this.group_queue.push(this.group);
		}

		this.group_id = this.next_id++;
		this.group = [name, this.groupRunner, [[]], this, this.group_id];
		
		return this.group_id;
	};
	
	/**
	 * End the last opened group
	 */
	UndoManager.prototype.endGroup = function() {
		var grp = this.group;
		
		if (this.group_queue.length > 0) {
			this.group = this.group_queue.pop();
		} else {
			this.group = null;
		}
		
		this.undoable.apply(this, grp);
		return this;
	};
	
	/**
	 * Exit the currently open queue;
	 * @param rollback Should the current undos be ran (rollback changes)? (Default true)
	 */
     UndoManager.prototype.exitGroup = function(rollback) {
		if (rollback !== false) {
		    var grp = this.group;
			this.startGroup('rolling back');
			grp[1].apply(grp[3], grp[2]);
            this.exitGroup(false); // So the redos don't get added to the undo queue
		}
		if (this.group_queue.length > 0) {
			this.group = this.group_queue.pop();
		} else {
			this.group = null;
		}
		return this;
	};
	
	/**
	 * Resume a previously ended group as long as it is still in the undo/redo queue
	 * @param id The group ID
	 */
	UndoManager.prototype.resumeGroup = function(id) {
	    // TODO: What happens if it isn't in the queue? (invalid id)
		if (this.group !== null) {
			this.group_queue.push(this.group);
		}
		
		this.group = this.action_index[id];
		this.group[5] = true;
		this.group_id = id;
		return this;
	};
	
	window.UndoManager = UndoManager;
})();