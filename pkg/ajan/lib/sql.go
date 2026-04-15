package lib

import (
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
)

var ErrUnexpectedNullStringType = errors.New("unexpected type for NullString")

type NullString struct {
	sql.NullString
}

func (ns *NullString) Scan(value any) error {
	switch value := value.(type) {
	case string:
		ns.String = value
		ns.Valid = true
	case []byte:
		ns.String = string(value)
		ns.Valid = true
	case nil:
		ns.String = ""
		ns.Valid = false
	default:
		return fmt.Errorf("%w: %T", ErrUnexpectedNullStringType, value)
	}

	return nil
}

func (ns *NullString) Value() (driver.Value, error) {
	if !ns.Valid {
		return nil, nil //nolint:nilnil
	}

	return ns.String, nil
}

func (ns *NullString) MarshalJSON() ([]byte, error) {
	if !ns.Valid {
		return []byte("null"), nil
	}

	return json.Marshal(ns.String) //nolint:wrapcheck
}

func (ns *NullString) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		ns.String = ""
		ns.Valid = false

		return nil
	}

	var str string

	err := json.Unmarshal(data, &str)
	if err != nil {
		return err //nolint:wrapcheck
	}

	ns.String = str
	ns.Valid = true

	return nil
}
